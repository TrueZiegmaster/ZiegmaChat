/***************************************************
 *              DO NOT EDIT THIS FILE              *
 *        THIS COULD BREAK YOUR WIDGET OR          *
 * BE A PROBLEM IF YOU WANT TO USE A NEWER VERSION *
 ***************************************************/

// General Variables
let ws;
let dev;
let template_twitch;
let template_youtube;
let template_reward;

/**
 * Storing avatars that have been called to save api calls
 * username: imageURL
 */
let avatars = new Map();

window.addEventListener("load", (event) => {
    loadTemplates();
    connectws();

    if (settings.debug.enabled) {
        //console.debug("Debug mode is enabled");
        debugMessages();
    }
});

/**
 * This will load all template,css files in themes/{{themename}}
 * Check console for errors if you theme doesn't work
 */
function loadTemplates() {
    const encodedTemplate = encodeURIComponent(settings.template);
    //  Loading message templates
    $("#templates").load(
        `themes/${encodedTemplate}/template.html`,
        function (response, status, xhr) {
            if (status == "error") {
                let msg = "Sorry but there was an error: ";
                //console.error(msg + xhr.status + " " + xhr.statusText);
            }
            if (status === "success") {
                // Loading template css
                $("head").append(
                    `<link rel="stylesheet" href="themes/${encodedTemplate}/css/styles.css" type="text/css" />`
                );

                template_twitch = document.querySelector("#message_twitch");
                template_youtube = document.querySelector("#message_youtube");
                template_reward = document.querySelector("#reward");
            }
        }
    );
}

/**
 * Types of messages
 * - Chatmessage
 * - Reward
 * - Message
 *
 * Default variables
 * - message.msgid
 * - message.username
 * - message.badges
 * - message.avatar
 * - message.time
 * - message.classes
 * @param {*} message
 */
async function pushMessage(type, message) {

    // Adding time variable
    let today = new Date();
    message.time = today.getHours() + ":" + String(today.getMinutes()).padStart(2, "0");

    // Mapping for special types
    switch (type) {

        // Chat message from Twitch
        case "chatmessage":

            // Adding default classes
            message.classes = ["msg"];

            if (!message.color) {
                message.color = settings.Twitch.defaultChatColor;
            }
            if (message.isHighlighted) {
                message.classes.push("highlight");
            }
            if (message.isReply) {
                message.classes.push("reply");
            }
            if (message.isCustomReward) {
                message.classes.push("reward");
            }
            if (message.isMe) {
                message.classes.push("me");
            }
            if (message.subscriber) {
                message.classes.push("subscriber");
            }
            if (message.role === 4) {
                message.classes.push("broadcaster");
            }
            if (message.role === 3) {
                message.classes.push("moderator");
            }
            if (message.role === 2) {
                message.classes.push("vip");
            }

            break;

        // Reward message from Twitch
        case "reward":
            message.msgId = message.id;
            message.title = message.reward.title;
            message.prompt = message.reward.prompt;
            message.displayName = message.user_name;

            // Adding userInput if not defined
            if (!message.user_input) {
                message.message = "";
            } else {
                message.message = message.user_input;
            }

            // Adding default classes
            message.classes = ["reward"];

            break;

        // Message from Youtube
        case "message":


            // Adding default classes
            message.classes = ["msg"];

            message.msgId = message.eventId;
            message.displayName = message.user.name;
            message.userId = message.user.id;

            message.color = settings.YouTube.defaultChatColor;

            if (message.user.isOwner === true) {
                message.classes.push("owner");
            }
            if (message.user.isModerator === true) {
                message.classes.push("moderator");
            }
            if (message.user.isSponsor === true) {
                message.classes.push("sponsor");
            }
            if (message.user.isVerified === true) {
                message.classes.push("verified");
            }

            break;

    }

    const msg = new Promise((resolve, reject) => {
        // Note: This is to prevent a streamer.bot message to not disappear.
        // - This could be a bug and will maybe be removed on a later date.
        if (message.msgId == undefined) {
            //console.debug("Message has no ID");
            message.msgId = makeid(6);
        }

        resolve(getProfileImage(type, message));
    })
        .then((avatar) => {
            //console.debug("Avatar: " + avatar);
            message.avatar = avatar;
            return renderBadges(message);
        })
        .then((bages) => {
            message.badges = bages;
            //return renderEmotes(message);
            return message;
        })
        .then((msg) => {
            msg = renderMessage(type, msg);

            if (msg) {
                $("#chat").append(msg);

                if (settings.animations.hidedelay > 0) {
                    removeMessage(message.msgId);
                }
            }
            else return Promise.reject();
        })
        .then(() => {
            //Prevent clipping
            let currentHeight = 0;
            $("#chat").children().each(function () {
                currentHeight += $(this).outerHeight(true);
            });

            let parentHeight = $('#chat').outerHeight(true);
            let count = 0;
            let $chatLine, lineHeight;

            while (currentHeight > parentHeight) {
                $chatLine = $('.msg').eq(count);
                lineHeight = $chatLine.outerHeight(true);


                $chatLine.addClass("animate__" + settings.animations.hideAnimation);
                $chatLine.bind("animationend", function () {
                    $(this).remove();
                });

                currentHeight -= lineHeight;
                count++;
            }
        })
        .catch(function (error) {
            //console.error(error);
        });
}

/**
 * Render message with template
 * @param {object} message
 * @returns
 */
function renderMessage(platform, message = {}) {

    //console.debug(message);

    let words = message.message.trim().split(" ");
    let new_words = [];
    let char_counter = words.length - 1;
    let contains_spam = false;

    function link_check(inputText, string) {
        let replacedText, replacePattern;

        replacePattern = /((?:(http|https|Http|Https|rtsp|Rtsp):\/\/(?:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,64}(?:\:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,25})?\@)?)?((?:(?:[a-zA-Z0-9][a-zA-Z0-9\-]{0,64}\.)+(?:(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])|(?:biz|b[abdefghijmnorstvwyz])|(?:cat|com|coop|c[acdfghiklmnoruvxyz])|d[ejkmoz]|(?:edu|e[cegrstu])|f[ijkmor]|(?:gov|g[abdefghilmnpqrstuwy])|h[kmnrtu]|(?:info|int|i[delmnoqrst])|(?:jobs|j[emop])|k[eghimnrwyz]|l[abcikrstuvy]|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])|(?:name|net|n[acefgilopruz])|(?:org|om)|(?:pro|p[aefghklmnrstwy])|qa|r[eouw]|s[abcdeghijklmnortuvyz]|(?:tel|travel|t[cdfghjklmnoprtvwz])|u[agkmsyz]|v[aceginu]|w[fs]|y[etu]|z[amw]))|(?:(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[0-9])))(?:\:\d{1,5})?)(\/(?:(?:[a-zA-Z0-9\;\/\?\:\@\&\=\#\~\-\.\+\!\*\'\(\)\,\_])|(?:\%[a-fA-F0-9]{2}))*)?(?:\b|$)/gi;
        replacedText = inputText.replace(replacePattern, string);

        return replacedText;
    }

    function email_check(inputText, string) {
        let replacedText, replacePattern;

        replacePattern = /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
        replacedText = inputText.replace(replacePattern, string);

        return replacedText;
    }

    function replaceWithEmote(word) {
        message.emotes.forEach((emote) => {
            if (emote.name == word) {
                word = `<img class="emote" src="${emote.imageUrl}">`;
            }
        });
        return word;
    }

    message.message = words.some(function (word, n) {
        word = replaceWithEmote(word);
        //Emote check
        if (words[n] != word) {
            new_words.push(word);
            char_counter += 5;
        }
        else {
            let check = link_check(email_check(word, "[email]"), "[link]");
            //Link|email check
            if (word != check) {
                word = `<span style='color: #00FFFF'>${check}</span>`;
                char_counter += 5;
            }
            else if (word.length > 20) {
                contains_spam = true;
            }
            new_words.push(word);
        }
        return char_counter > settings.filter.characterLimit;
    }) ? new_words.join(" ") + " <span style='color: #00FFFF'>[...]</span>" : new_words.join(" ");

    if (contains_spam) { return }

    switch (platform) {
        case "chatmessage":
            var tpl = template_twitch;
            break;

        case "message":
            var tpl = template_youtube;
            break;

        case "reward":
            var tpl = template_reward;
            break;


        default:
            break;
    }

    if (settings.animations.animation) {
        message.classes.push("animate__animated");

        if (settings.animations.showAnimation) {
            message.classes.push("animate__" + settings.animations.showAnimation);
        }
    }

    // Blacklist word filter
    if (settings.blacklist.words && platform != "Reward") {
        settings.blacklist.words.forEach((word) => {
            regEx = new RegExp(word, "ig")
            message.message = message.message.replace(regEx, "****");
        });
    }

    message.classes = message.classes.join(" ");

    const pattern = /{{\s*(\w+?)\s*}}/g; // {property}
    return tpl.innerHTML.replace(pattern, (_, token) => message[token] || "");
}

/**
 * Hides a message after an amount of time and deletes it aferwards
 * @param {string} msgId
 */
function removeMessage(msgId) {
    //console.log("Hide ID " + msgId + "in " + settings.animations.hidedelay);

    const msg = new Promise((resolve, reject) => {
        delay(settings.animations.hidedelay).then(function () {
            $("#" + msgId).addClass("animate__" + settings.animations.hideAnimation);
            $("#" + msgId).bind("animationend", function () {
                $("#" + msgId).remove();
            });
            resolve();
        });
    }).catch(function (error) {
        //console.error(error);
    });
}

/**
 * Creates a markup of all Badges so it can be renderd as one
 * @param {object} message
 * @returns
 */
async function renderBadges(message) {
    let badges = "";

    if (!message.badges) return badges;

    message.badges.forEach((badge) => {
        badges += `<img class="${badge.name}" title="${badge.name}" src="${badge.imageUrl}">`;
    });

    return badges;
}

/**
 * Swaping Emote names for emote images
 * Todo: Add a new way to get image url if its unknown
 * https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_5313d0941014484f9995197017132c33/static/light/3.0
 * @param {object} message
 * @returns
 */
async function renderEmotes(message) {

    if (!message.emotes) return message;

    // Check if Message is emote only
    if (message.message.split(" ").length == message.emotes.length) {
        message.classes.push("emoteonly");
    }

    message.emotes.forEach((emote) => {
        message.message = message.message.replace(
            emote.name,
            `<img class="emote" src="${emote.imageUrl}">`
        );
    });

    return message;
}

/**
 * Swaping Emote names for emote images
 * @param {object} message
 * @returns
 */
async function renderYTEmotes(message) {
    // Todo: Find a way to get Emotes https://github.com/BlackyWhoElse/streamer.bot-actions/issues/56
    return message;
}

/**
 * Calling decapi.me to recive avatar link as string
 * @param {string} username
 * @returns
 */
async function getProfileImage(type, message) {
    //console.debug(message);

    username = "";

    switch (type) {
        case "chatmessage":

            username = message.username;

            // Check if avatar is already stored
            if (avatars.get(username)) {
                return avatars.get(username);
            }

            return fetch(`https://decapi.me/twitch/avatar/${username}`)
                .then((response) => {
                    return response.text();
                })
                .then((avatar) => {
                    avatars.set(username, avatar);
                    return avatar;
                });
            break;

        case "message":
            username = message.user.name;

            // Check if avatar is already stored
            if (avatars.get(username)) {
                return avatars.get(username);
            }

            avatars.set(username, message.user.profileImageUrl);
            return message.user.profileImageUrl;
            break;
    }
}

// Command Code
function ClearChat() {
    $("#chat").html("");
}

// Helper Code
function delay(t, v) {
    return new Promise(function (resolve) {
        setTimeout(resolve.bind(null, v), t);
    });
}

function __debugMessages() {
    let sub = false;
    let r = Math.floor(Math.random() * (4 - 1 + 1) + 1)

    if (Math.random() == 1) sub = true;

    let message = {
        avatar: "https://static-cdn.jtvnw.net/jtv_user_pictures/35c9d8fb-6dd6-4e26-bd28-ff37b316056a-profile_image-300x300.png",
        bits: 0,
        badges: [{
            imageUrl: "https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3",
            name: "broadcaster",
        },
        {
            imageUrl: "https://static-cdn.jtvnw.net/badges/v1/de6d9479-80dc-4d5a-99ab-8db5ee2ac1c9/3",
            name: "subscriber",
        },
        ],
        channel: "ziegmaster",
        color: "#B33B19",
        displayName: "Ziegmaster",
        firstMessage: false,
        hasBits: false,
        internal: false,
        isAnonymous: false,
        isCustomReward: false,
        isHighlighted: false,
        isMe: false,
        isReply: false,
        monthsSubscribed: 12,
        msgId: makeid(12),
        role: r,
        subscriber: sub,
        userId: 160832700,
        username: "ziegmaster",
        time: "13:37",
    };

    pushMessage('chatmessage', { ...message, ...randomMessage() });
}

// Debug Code
function debugMessages() {

    __debugMessages();

    dev = setInterval(__debugMessages, settings.debug.messageInterval);
}

function makeid(length) {
    let result = "";
    let characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function randomMessage() {

    let msgs = [
        {
            message: "Heeey! How are you?",
            emotes: [],
        },
        {
            message: "Wassup m8???",
            emotes: [],
        },
        {
            message: "Svin Svin Svin",
            emotes: [
                {
                    name: "Svin",
                    type: "BTTVChannel",
                    imageUrl: "https://cdn.betterttv.net/emote/5f0435ed6bd7f3052a0c5564/3x"
                },
                {
                    name: "Svin",
                    type: "BTTVChannel",
                    imageUrl: "https://cdn.betterttv.net/emote/5f0435ed6bd7f3052a0c5564/3x"
                },
                {
                    name: "Svin",
                    type: "BTTVChannel",
                    imageUrl: "https://cdn.betterttv.net/emote/5f0435ed6bd7f3052a0c5564/3x"
                },
            ],
        },
        {
            message: "Worst stream I've ever watched in my life :P",
            emotes: [],
        },
        {
            message: "Hello, I would like to suggest you go to this website twitch.tv/ziegmaster, this is definitely not a scam BloodTrail",
            emotes: [
                {
                    name: "BloodTrail",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/69/default/dark/2.0"
                },
            ],
        },
        {
            message: "Let's be best friends, here's my email: freak@gmail.com AYAYALove",
            emotes: [
                {
                    name: "AYAYALove",
                    type: "BTTVChannel",
                    imageUrl: "https://cdn.betterttv.net/emote/5c136451182c9d4099a83068/3x"
                },
            ],
        },
        {
            message: "Essay on the topic: \"How I spent my summer\". No way ziegmaClown did you really think that I would write something so stupid!? No one needs you, get over it BloodTrail",
            emotes: [
                {
                    name: "ziegmaClown",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_fba8064aa3b14d6c9d266c720586f48b/default/dark/2.0"
                },
                {
                    name: "BloodTrail",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/69/default/dark/2.0"
                },
            ],
        },
        {
            message: "One day I will become popular PoroSad",
            emotes: [
                {
                    name: "PoroSad",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_4c39207000564711868f3196cc0a8748/default/dark/2.0"
                }
            ],
        },
        {
            message: "He doesn't know, we won't say BloodTrail He doesn't know, we won't say BloodTrail He doesn't know, we won't say BloodTrail He doesn't know, we won't say BloodTrail He doesn't know, we won't say BloodTrail He doesn't know, we won't say BloodTrail",
            emotes: [
                {
                    name: "BloodTrail",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/69/default/dark/2.0"
                },
                {
                    name: "BloodTrail",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/69/default/dark/2.0"
                },
                {
                    name: "BloodTrail",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/69/default/dark/2.0"
                },
                {
                    name: "BloodTrail",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/69/default/dark/2.0"
                },
                {
                    name: "BloodTrail",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/69/default/dark/2.0"
                },
                {
                    name: "BloodTrail",
                    type: "Twitch",
                    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/69/default/dark/2.0"
                },
            ],
        },
    ];

    msg = msgs[Math.floor(Math.random() * msgs.length)]

    return msg;
}