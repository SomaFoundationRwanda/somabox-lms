// school settings, learner codes, device identity screen text (fr). Keys must match en.js.
export default {
    "learnerCode": "Code élève",
    "schoolWord": "École",
    "done": "Terminé",
    "loading": "Chargement…",
    "saving": "Enregistrement…",
    "onboarding": {
        "schoolLabel": "École :"
    },
    "login": {
        "label": "E-mail ou code élève",
        "placeholder": "vous@exemple.com ou GSK-0012"
    },
    "signup": {
        "createdTitle": "Votre compte est prêt",
        "codeMessage": "Votre code élève est {code}. Vous pouvez vous connecter avec ce code au lieu de votre e-mail.",
        "writeItDown": "Notez-le dans un endroit sûr. Vous le retrouverez aussi sur la page Compte.",
        "continue": "Continuer"
    },
    "account": {
        "codeHint": "Vous pouvez vous connecter avec ce code au lieu de votre e-mail."
    },
    "users": {
        "createdCode": "Donnez ce code à l'élève. Il peut se connecter avec {code} au lieu de son e-mail."
    },
    "settings": {
        "navTitle": "École",
        "navSubtitle": "Nom de l'école, codes élèves et localisation",
        "loadFailed": "Impossible de charger les paramètres de l'école.",
        "saveFailed": "Impossible d'enregistrer les paramètres de l'école.",
        "codeInvalid": "Le code doit contenir de 2 à 8 lettres ou chiffres.",
        "saved": "Paramètres de l'école enregistrés.",
        "back": "Administration",
        "eyebrow": "École",
        "title": "Paramètres de l'école",
        "description": "L'école que ce boîtier dessert, et la façon dont les codes élèves sont créés.",
        "oneBoxOneSchool": "Un boîtier dessert une seule école : on ne demande donc pas aux élèves leur école, son emplacement ni si elle est en zone rurale. Ces informations viennent d'ici, et changer le nom ou le choix rural/urbain met à jour tous les élèves de ce boîtier.",
        "codeOnlyNew": "Changer le code ne concerne que les nouveaux élèves. Ceux qui ont déjà un code le gardent.",
        "name": "Nom de l'école",
        "namePlaceholder": "ex. GS Kigali",
        "code": "Code de l'école",
        "codeHelp": "De 2 à 8 lettres ou chiffres. Il commence chaque code élève.",
        "codePreview": "Les nouveaux élèves recevront des codes comme {example}",
        "codeChanging": "Les élèves qui ont déjà un code {old} le gardent.",
        "province": "Province",
        "district": "District",
        "notSet": "Non défini",
        "provinceFirst": "Choisissez d'abord une province",
        "ruralLegend": "L'école est-elle en zone rurale ou urbaine ?",
        "rural": "Rurale",
        "urban": "Urbaine (ville)",
        "ruralUnset": "Non défini",
        "ruralHelp": "Quand ce choix est fait, on ne demande pas aux élèves où ils habitent.",
        "save": "Enregistrer les paramètres",
        "brandingNote": "Le logo et les couleurs se règlent sur la page Image de marque.",
        "brandingLink": "Ouvrir Image de marque"
    },
    "device": {
        "unknown": "Inconnu",
        "title": "Ce boîtier",
        "description": "L'identité de ce boîtier et son historique de synchronisation sont envoyés au cloud à chaque synchronisation, pour que le boîtier puisse être reconnu et assisté.",
        "noSerial": "Le numéro de série ne peut pas encore être lu. Demandez à la personne qui a installé le boîtier d'exécuter une fois le script de l'appareil en tant qu'administrateur (root) :",
        "enableService": "et d'activer somabox-device-info.service pour qu'il s'exécute à chaque démarrage :",
        "serial": "Numéro de série",
        "model": "Modèle",
        "mac": "Adresses MAC",
        "virtual": "virtuelle",
        "machineId": "Identifiant de la machine",
        "hostname": "Nom d'hôte",
        "os": "Système",
        "hardware": "Matériel",
        "memory": "Mémoire",
        "disk": "Disque",
        "source": "Lu par",
        "sourceScript": "Script de l'appareil (en administrateur)",
        "sourceServer": "Le serveur seulement (pas de numéro de série)"
    }
};
