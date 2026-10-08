// school settings, learner codes, device identity screen text (rw). Keys must match en.js.
// Kinyarwanda: English for now, until a confident translation is available.
export default {
    "learnerCode": "Learner code",
    "schoolWord": "School",
    "done": "Done",
    "loading": "Loading…",
    "saving": "Saving…",
    "onboarding": {
        "schoolLabel": "School:"
    },
    "login": {
        "label": "Email or learner code",
        "placeholder": "you@example.com or GSK-0012"
    },
    "signup": {
        "createdTitle": "Your account is ready",
        "codeMessage": "Your learner code is {code}. You can log in with it instead of your email.",
        "writeItDown": "Write it down somewhere safe. You will also find it on your Account page.",
        "continue": "Continue"
    },
    "account": {
        "codeHint": "You can log in with this code instead of your email."
    },
    "users": {
        "createdCode": "Give this code to the learner. They can log in with {code} instead of their email."
    },
    "settings": {
        "navTitle": "School",
        "navSubtitle": "School name, learner codes and location",
        "loadFailed": "Couldn't load the school settings.",
        "saveFailed": "Couldn't save the school settings.",
        "codeInvalid": "The code must be 2 to 8 letters or numbers.",
        "saved": "School settings saved.",
        "back": "Admin",
        "eyebrow": "School",
        "title": "School settings",
        "description": "The school this box serves, and how learner codes are made.",
        "oneBoxOneSchool": "One box serves one school, so learners aren't asked for their school, its place or whether it is rural. They are filled in from here, and changing the name or rural/urban updates every learner on this box.",
        "codeOnlyNew": "Changing the code only affects new learners. Learners who already have a code keep it.",
        "name": "School name",
        "namePlaceholder": "e.g. GS Kigali",
        "code": "School code",
        "codeHelp": "2 to 8 letters or numbers. It starts every learner code.",
        "codePreview": "New learners get codes like {example}",
        "codeChanging": "Learners who already have a {old} code keep it.",
        "province": "Province",
        "district": "District",
        "notSet": "Not set",
        "provinceFirst": "Choose a province first",
        "ruralLegend": "Is the school in a rural or urban area?",
        "rural": "Rural",
        "urban": "Urban (town or city)",
        "ruralUnset": "Not set",
        "ruralHelp": "When this is set, learners aren't asked where they live.",
        "save": "Save school settings",
        "brandingNote": "Logo and colours are set on the Branding page.",
        "brandingLink": "Open Branding"
    },
    "device": {
        "unknown": "Not known",
        "title": "This box",
        "description": "This box's identity and its sync history are sent to the cloud with every sync, so the box can be recognised and supported.",
        "noSerial": "The serial number can't be read yet. Ask the person who installed the box to run the device script once as administrator (root):",
        "enableService": "and enable somabox-device-info.service so it runs at every start:",
        "serial": "Serial number",
        "model": "Model",
        "mac": "MAC addresses",
        "virtual": "virtual",
        "machineId": "Machine ID",
        "hostname": "Host name",
        "os": "System",
        "hardware": "Hardware",
        "memory": "Memory",
        "disk": "Disk",
        "source": "Read by",
        "sourceScript": "Device script (as administrator)",
        "sourceServer": "The server only (no serial number)"
    }
};
