const path = require("path");

const WINDOWS_RESERVED_NAMES = [
"CON",
"PRN",
"AUX",
"NUL",
"COM1",
"COM2",
"COM3",
"COM4",
"COM5",
"COM6",
"COM7",
"COM8",
"COM9",
"LPT1",
"LPT2",
"LPT3",
"LPT4",
"LPT5",
"LPT6",
"LPT7",
"LPT8",
"LPT9"
];

function normalizeExtension(extension) {
if (!extension) {
return "";
}

const cleaned = String(extension)
.replace(/^\.+/, "")
.replace(/[^A-Za-z0-9]/g, "");

if (!cleaned) {
return "";
}

return "." + cleaned;
}

function trimUnsafeDotsAndSpaces(value) {
return String(value || "")
.replace(/^[.\s]+/, "")
.replace(/[.\s]+$/, "");
}

function replaceUnsafeCharacters(value) {
return String(value || "")
.replace(/[<>:"|?*]/g, "")
.replace(/[\\/]+/g, "")
.replace(/[\x00-\x1f]/g, "")
.replace(/\s+/g, "");
}

module.exports = {
WINDOWS_RESERVED_NAMES,
normalizeExtension,
trimUnsafeDotsAndSpaces,
replaceUnsafeCharacters,
collapseUnderscores,
avoidReservedName,
limitLength,
makeSafeFileName,
makeTimestampForFileName,
makeSafeTimestampedFileName,
isSafeFileName
};