const app = require('../../app');
const utils = require('../policy/utils.js');

function combineMessageInfo (languageChoice, messageInfo, next) {
    const filteredCategories = messageInfo[0];
    const fallbackCategories = messageInfo[1];
    const changedEntries = messageInfo[2];
    const allMessages = messageInfo[3]; //for finding how many languages exist per category

    //add fallback categories first by category name, then use filtered categories for overwriting

    //make all categories PRODUCTION status by default
    let hash = {};
    for (let i = 0; i < fallbackCategories.length; i++) {
        hash[fallbackCategories[i].message_category] = fallbackCategories[i];
        hash[fallbackCategories[i].message_category].status = 'PRODUCTION';
    }
    for (let i = 0; i < filteredCategories.length; i++) {
        hash[filteredCategories[i].message_category] = filteredCategories[i];
        hash[fallbackCategories[i].message_category].status = 'PRODUCTION';
    }

    //change the status of the entries so instead it means whether any entry in that category has been modified
    //go through each changed entry to determine that. 
    for (let i = 0; i < changedEntries.length; i++) {
        hash[changedEntries[i].message_category].status = 'STAGING';
    }

    //add language count for each category
    for (let i = 0; i < allMessages.length; i++) {
        if (hash[allMessages[i].message_category].language_count === undefined) {
            hash[allMessages[i].message_category].language_count = 0;
        }
        hash[allMessages[i].message_category].language_count++;
    }    

    let categories = [];
    for (let category in hash) {
        categories.push(hash[category]);
    }

    next(null, categories);
}

function generateCategoryTemplate (info, next) {
    const languages = info[0];

    let template = {};
    for (let i = 0; i < languages.length; i++) {
        const lang = languages[i].id;
        template[lang] = {
            id: 0,
            language_id: lang,
            message_category: "",
            status: "",
            label: null,
            line1: null,
            line2: null,
            text_body: null,
            tts: null,
            selected: false, //for the UI
            is_deleted: false 
        }
    }
    next(null, template);
}

function transformMessages (info, next) {
    const template = info[0];
    const texts = info[1];
    
    //if a text exists for a language, that gets added to the template as a selected language
    for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        template[text.language_id].id = text.id;
        template[text.language_id].language_id = text.language_id;
        template[text.language_id].message_category = text.message_category;
        template[text.language_id].status = text.status;
        template[text.language_id].label = text.label;
        template[text.language_id].line1 = text.line1;
        template[text.language_id].line2 = text.line2;
        template[text.language_id].text_body = text.text_body;
        template[text.language_id].tts = text.tts;
        template[text.language_id].selected = true;
        template[text.language_id].is_deleted = text.is_deleted;
    }

    next(null, template);
}

function convertMessagesJson (messagesObj, isProduction) {
    let statusName = "";
    if (isProduction) {
        statusName = 'PRODUCTION';
    }
    else {
        statusName = 'STAGING';
    }
    //break the JSON down into smaller objects for SQL insertion
    let messagesArray = [];
    for (let lang in messagesObj.messages) {
        messagesArray.push(messagesObj.messages[lang]);
    }
    //remove entries with selected = false
    messagesArray = messagesArray.filter(function (msg) {
        return msg.selected;
    });

    //all messages should change to isProduction status
    return messagesArray.map(function (msg) {
        return {
            language_id: msg.language_id,
            message_category: msg.message_category,
            label: msg.label,
            line1: msg.line1,
            line2: msg.line2,
            text_body: msg.text_body,
            tts: msg.tts,        
            status: statusName,
            is_deleted: msg.is_deleted
        };
    });
}

module.exports = {
    combineMessageInfo: combineMessageInfo,
    transformMessages: transformMessages,
    generateCategoryTemplate: generateCategoryTemplate,
    convertMessagesJson: convertMessagesJson
}