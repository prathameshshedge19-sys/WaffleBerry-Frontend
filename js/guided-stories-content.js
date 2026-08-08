"use strict";

window.WaffleBerryStoryChapters =
    Object.freeze([
        ["childhood", "🧒", "Childhood", "Let's remember your childhood together."],
        ["home-family", "🏡", "Home & Family", "Let's remember the people and places that made home feel like home."],
        ["education", "🎓", "Education", "Let's revisit the places where you learned and grew."],
        ["career", "💼", "Career", "Let's remember the work that shaped your life."],
        ["love-marriage", "❤️", "Love & Marriage", "Let's preserve the stories of love in your life."],
        ["parenthood", "👨‍👩‍👧", "Parenthood", "Let's remember the moments that made parenthood meaningful."],
        ["traditions", "🎉", "Traditions & Celebrations", "Let's gather the traditions that brought everyone together."],
        ["adventures", "🌍", "Adventures & Travel", "Let's return to the journeys that opened up your world."],
        ["life-lessons", "💡", "Life Lessons", "Let's preserve the wisdom life has given you."],
        ["anything-else", "⭐", "Anything Else", "This chapter is yours to shape in any way you choose."]
    ].map(([
        id,
        icon,
        title,
        introduction
    ]) => Object.freeze({
        id,
        icon,
        title,
        introduction
    })));
