// school settings, learner codes, device identity screen text (es). Keys must match en.js.
export default {
    "learnerCode": "Código de estudiante",
    "schoolWord": "Escuela",
    "done": "Listo",
    "loading": "Cargando…",
    "saving": "Guardando…",
    "onboarding": {
        "schoolLabel": "Escuela:"
    },
    "login": {
        "label": "Correo o código de estudiante",
        "placeholder": "tu@ejemplo.com o GSK-0012"
    },
    "signup": {
        "createdTitle": "Tu cuenta está lista",
        "codeMessage": "Tu código de estudiante es {code}. Puedes iniciar sesión con él en lugar de tu correo.",
        "writeItDown": "Anótalo en un lugar seguro. También lo encontrarás en tu página de Cuenta.",
        "continue": "Continuar"
    },
    "account": {
        "codeHint": "Puedes iniciar sesión con este código en lugar de tu correo."
    },
    "users": {
        "createdCode": "Entrega este código al estudiante. Puede iniciar sesión con {code} en lugar de su correo."
    },
    "settings": {
        "navTitle": "Escuela",
        "navSubtitle": "Nombre de la escuela, códigos de estudiante y ubicación",
        "loadFailed": "No se pudo cargar la configuración de la escuela.",
        "saveFailed": "No se pudo guardar la configuración de la escuela.",
        "codeInvalid": "El código debe tener de 2 a 8 letras o números.",
        "saved": "Configuración de la escuela guardada.",
        "back": "Administración",
        "eyebrow": "Escuela",
        "title": "Configuración de la escuela",
        "description": "La escuela a la que sirve esta caja y cómo se crean los códigos de estudiante.",
        "oneBoxOneSchool": "Una caja sirve a una sola escuela, así que a los estudiantes no se les pregunta su escuela, dónde está ni si es rural. Se completa desde aquí, y cambiar el nombre o rural/urbano actualiza a todos los estudiantes de esta caja.",
        "codeOnlyNew": "Cambiar el código solo afecta a los estudiantes nuevos. Quienes ya tienen un código lo conservan.",
        "name": "Nombre de la escuela",
        "namePlaceholder": "p. ej. GS Kigali",
        "code": "Código de la escuela",
        "codeHelp": "De 2 a 8 letras o números. Es el comienzo de cada código de estudiante.",
        "codePreview": "Los estudiantes nuevos recibirán códigos como {example}",
        "codeChanging": "Los estudiantes que ya tienen un código {old} lo conservan.",
        "province": "Provincia",
        "district": "Distrito",
        "notSet": "Sin definir",
        "provinceFirst": "Elige primero una provincia",
        "ruralLegend": "¿La escuela está en una zona rural o urbana?",
        "rural": "Rural",
        "urban": "Urbana (pueblo o ciudad)",
        "ruralUnset": "Sin definir",
        "ruralHelp": "Cuando está definido, no se pregunta a los estudiantes dónde viven.",
        "save": "Guardar configuración",
        "brandingNote": "El logotipo y los colores se configuran en la página de Marca.",
        "brandingLink": "Abrir Marca"
    },
    "device": {
        "unknown": "Desconocido",
        "title": "Esta caja",
        "description": "La identidad de esta caja y su historial de sincronización se envían a la nube en cada sincronización, para poder reconocer la caja y darle soporte.",
        "noSerial": "Todavía no se puede leer el número de serie. Pide a quien instaló la caja que ejecute una vez el script del dispositivo como administrador (root):",
        "enableService": "y que active somabox-device-info.service para que se ejecute en cada arranque:",
        "serial": "Número de serie",
        "model": "Modelo",
        "mac": "Direcciones MAC",
        "virtual": "virtual",
        "machineId": "ID de la máquina",
        "hostname": "Nombre del equipo",
        "os": "Sistema",
        "hardware": "Hardware",
        "memory": "Memoria",
        "disk": "Disco",
        "source": "Leído por",
        "sourceScript": "Script del dispositivo (como administrador)",
        "sourceServer": "Solo el servidor (sin número de serie)"
    }
};
