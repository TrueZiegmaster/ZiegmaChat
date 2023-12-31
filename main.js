const { 
  app, 
  Menu, 
  Tray, 
  BrowserWindow, 
  ipcMain, 
  dialog, 
  nativeImage, 
  shell
} = require('electron');
const { satisfies } = require('compare-versions');
const { readdir } = require('fs/promises');
const {
  settings, 
  mainWindowState, 
  chatWindowState
} = require('./settings');
const { parseConfig } = require('./modules/config-parser');
const { httpServer, setPublic } = require('./modules/server');
const path = require('path');

const appIcon = nativeImage.createFromPath(path.join(__dirname, '/images/app-icon.png'));

const checkVersion = async () => {
  const storedVersion = settings.get('version') || '1.2.0';
  const currentVersion = app.getVersion();
  if (satisfies(storedVersion, `<${currentVersion}`)){
    await dialog.showMessageBox({
      title: 'ZiegmaChat',
      type: 'question',
      message: `You have updated ZiegmaChat from version ${storedVersion == '1.2.0' ? '1.2.0 or less' : storedVersion}. It is recommended to restore the default settings if you find any errors, as they may be caused by changes to the settings structure.\n\nDo this now? (Can be done later in the application.)`,
      buttons: ['&Yes', '&Later'],
      defaultId: 1,
      cancelId: 1,
      normalizeAccessKeys: true,
      icon: appIcon,
    }).then(promise => {
      settings.set('version', currentVersion);
      if (promise.response === 0) {
        settings.set('app', settings.get('defaults'));
      }
    });
  }
}

// GENERATE WIDGET URL FOR FURTHER USAGE AND EXPORT
const getWidgetURL = () => {
  const s = settings.get('app');
  const finalQP = new URLSearchParams({...s.widget.general, ...s.widget.themes[s.widget.general['theme']]}).toString();
  return `http://localhost:${s.server.port}/?${finalQP}`;
};

// MAIN WINDOW
app.createMainWindow = function(){
  this.mainWindow = new BrowserWindow({
    x: this.mainWindowState.x,
    y: this.mainWindowState.y,
    width: 420,
    height: 440,
    icon: appIcon,
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '/preload.js'),
    },
  });
  this.mainWindow.removeMenu();
  //Hide to tray instead of minimizing
  this.mainWindow.on('minimize', (event) => {
    event.preventDefault();
    this.mainWindow.hide();
  });
  //Close entire app
  this.mainWindow.on('closed', () => {
    this.mainWindow = null;
    this.chatWindow?.close();
    this.quit();
  });
  this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  this.mainWindow.loadFile('index.html');
  this.mainWindowState.manage(this.mainWindow);
}

// CHAT WINDOW
app.createChatWindow = function(){
  const gameMode = settings.get('app.widget.gameMode');
  this.chatWindow = new BrowserWindow({
    x: this.chatWindowState.x,
    y: this.chatWindowState.y,
    width: this.chatWindowState.width,
    height: this.chatWindowState.height,
    fullscreenable: false,
    focusable: !gameMode,
    transparent: gameMode,
    frame: !gameMode,
    hasShadow: !gameMode,
    icon: appIcon,
  });
  this.chatWindow.removeMenu();
  //This is the best solution but still doesn't work in all cases
  this.chatWindow.setAlwaysOnTop(gameMode, 'screen-saver');
  this.chatWindow.setIgnoreMouseEvents(gameMode);
  //Send closed event to the main window when the window is actually closed
  this.chatWindow.on('closed', () => {
    this.chatWindow = null;
    this.mainWindow?.webContents.send('chat-window-closed');
  });
  this.chatWindow.loadURL(getWidgetURL());
  this.chatWindowState.manage(this.chatWindow);
  //Send opened event to the main window
  this.mainWindow.webContents.send('chat-window-opened');
}

app.setHandlers = function(){

  process.on('uncaughtException', (error) => {
    let message;
    switch (error.code){
      case 'EADDRINUSE':
        message = `The application attempted to host a chat widget on port ${settings.get('app.server.port')}, but it is already in use by another program. Please change it to another available port on your system (0-65535).`
        break;
      default:
        message = error.message;
        break;
    }
    dialog.showMessageBox(this.mainWindow, {
      title: 'ZiegmaChatError',
      type: 'error',
      message: message,
      icon: appIcon,
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0){
      this.createMainWindow()
    };
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin'){
      this.quit()
    };
  });

  ipcMain.on('chat-window-open', () => this.createChatWindow());

  ipcMain.on('chat-window-close', () => this.chatWindow.destroy());

  ipcMain.handle('get-widget-url', () => getWidgetURL());

  ipcMain.handle('get-themes', () => {
    return (async (source) => (await readdir(source, { withFileTypes: true }))
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name))(path.join(__dirname, '/widget/themes'));
  });

  ipcMain.handle('theme-load', (_, theme) => {
    try {
      const themeConfig = parseConfig(
        path.join(__dirname, `/widget/themes/${theme}/theme.config.json`),
        path.join(__dirname, '/schemas/theme.config.json')
      );
      if (!themeConfig){
        throw new Error('Theme config file is invalid or empty.');
      }
      let s = settings.get(`app.widget.themes.${theme}`);
      if (!s) {
        const themeDefaults = {};
        Object.keys(themeConfig.fields).forEach(field => {
          themeDefaults[field] = themeConfig.fields[field]['value']['default'];
        });
        s = themeDefaults;
        settings.set(`app.widget.themes.${theme}`, s);
      }
      return { config: themeConfig, settings: s };
    }
    catch (e) {
      return { errorMessage : e};
    }
  });

  ipcMain.handle('settings-get', () => settings.get('app'));

  ipcMain.on('settings-set', (_, changedSettings) => {
    const theme = Object.keys(changedSettings.widget.themes)[0];
    const serverSettings = settings.get('app.server');
    settings.set('app.server', { ...serverSettings, ...changedSettings.server });
    const widgetGeneralSettings = settings.get('app.widget.general');
    settings.set('app.widget.general', { ...widgetGeneralSettings, ...changedSettings.widget.general });
    const widgetThemeSettings = settings.get(`app.widget.themes.${theme}`);
    settings.set(`app.widget.themes.${theme}`, { ...widgetThemeSettings, ...changedSettings.widget.themes[theme] });
    if (changedSettings.server.port) {
      this.httpServer.close();
      this.httpServer.listen(changedSettings.server.port);
    }
    if (Object.keys(changedSettings.widget.general).length > 0 || Object.keys(changedSettings.widget.themes[theme]).length > 0) {
      this.chatWindow?.loadURL(getWidgetURL());
    }
  });

  ipcMain.handle('settings-reset', async () => {
    let response = false;
    await dialog.showMessageBox(this.mainWindow, {
      title: 'ZiegmaChat',
      type: 'question',
      buttons: ['&Yes', '&Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'Are you sure you want to reset to defaults?',
      normalizeAccessKeys: true,
      icon: appIcon,
    }).then(promise => {
      if (promise.response === 0) {
        settings.set('app', settings.get('defaults'));
        this.httpServer.close();
        this.httpServer.listen(settings.get('app.server.port'));
        if (this.chatWindow) {
          this.chatWindow.destroy();
          this.createChatWindow();
        }
        response = true;
      }
    });
    return response;
  });

  ipcMain.handle('toggle-game-mode', () => {
    const gameMode = !settings.get('app.widget.gameMode');
    settings.set('app.widget.gameMode', gameMode);
    if (this.chatWindow){
      this.chatWindow.destroy();
      this.createChatWindow();
    }
    return gameMode;
  });
}

// ELECTRON MAIN
app.whenReady().then(async () => {
  await checkVersion();
  app.mainWindowState = mainWindowState();
  app.chatWindowState = chatWindowState();
  app.createMainWindow();
  app.setHandlers();

  app.tray = new Tray(appIcon);
  app.tray.setToolTip('ZiegmaChat');
  app.tray.on('click', () => {
    app.mainWindow.show();
  });
  app.tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'ZiegmaChat for Streamer.bot',
      enabled: false,
    },
    {
      type: 'separator',
    },
    {
      label: 'Show', click: () => {
        app.mainWindow.show();
      }
    },
    {
      label: 'Quit', click: () => {
        app.mainWindow.destroy();
        app.quit();
      }
    }
  ]));

  // Start internal HTTP server
  setPublic(path.join(__dirname, '/widget'));
  app.httpServer = httpServer.listen(settings.get('app.server.port'));
});