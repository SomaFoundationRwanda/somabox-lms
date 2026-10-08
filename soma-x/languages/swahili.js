import swSchool from "./school/sw";
import swExplore from "./explore/sw";
import swAttendance from "./attendance/sw";
import swGuest from "./guest/sw";
import swExplainers from "./explainers/sw";

export default {
    "attendance": swAttendance,
    "guest": swGuest,
    "explore": swExplore,
    "school": swSchool,
    "explainers": swExplainers,
    "nav": {
        "dashboard": "Nyumbani",
        "lessons": "Masomo",
        "howToUse": "Jinsi ya Kutumia", 
        "customize": "Badilisha",
        "library": "Maktaba",
        "account": "Akaunti"
    },
    "homeTitle": "Karibu kwenye SOMABOX",
    "teacherTitle": "Mlango wa Walimu",
    "teacherSubtitle": "Simamia madarasa na maudhui yako",
    "adminTitle": "Lango la Msimamizi",
    "adminSubtitle": "Dhibiti kila kitu ndani ya SomaBox yako",
    "logout": "Toka",
    "librarySubtitle": "Pata mamia ya vitabu vya kielimu",
    "languageName": "KISWAHILI",
    "loading": "Inapakia...",
    "howToUse": "Jinsi ya Kutumia",
    "searchPlaceholder": "Tafuta kwa maneno muhimu, kategoria",
    "homeSubtitle": "Pata mafunzo bila mtandao",
    "manageOptions": {
        "classesTitle": "Madarasa",
        "contentTitle": "Simamia Maudhui",
        "manualTitle": "Mwongozo wa Mtumiaji",
        "preferenceTitle": "Mapendeleo",
        "classesSubtitle": "Simamia madarasa yako",
        "contentSubtitle": "Pakia, ficha, futa maudhui kwa wanafunzi wako",
        "manualSubtitle": "Jifunze jinsi ya kutumia mlango wa walimu",
        "preferenceSubtitle": "Simamia mapendeleo yako"
    },
    "categories": {
        "rwandan-education": "Elimu ya Rwanda", // Use actual slug from backend
        "international-education": "Elimu ya Kimataifa",
        "languages": "Lugha",
        "custom-content": "Maudhui maalum"
    },
    "educationLevels": {
        "nursery-school-content": "Shule ya chekechea",
        "primary-school-content": "Shule ya msingi",
        "secondary-school-content": "Shule ya sekondari",
        "university-content": "Kiwango cha chuo kikuu",
        "english-language": "Kiingereza",
        "french-language": "Kifaransa",
        "kiswahili-language": "Kiswahili",
        "kinyarwanda-language": "Kinyarwanda",

        "p1": "Daraja la 1",
        "p2": "Daraja la 2",
        "p3": "Daraja la 3",
        "p4": "Daraja la 4",
        "p5": "Daraja la 5",
        "p6": "Daraja la 6",

        "s1": "Kidato cha 1",
        "s2": "Kidato cha 2",
        "s3": "Kidato cha 3",
        "s4": "Kidato cha 4",
        "s5": "Kidato cha 5",
        "s6": "Kidato cha 6",

        
        "baby-class": "Darasa la watoto",
        "middle-class": "Darasa la kati",
        "top-class": "Darasa la juu"

    },
    "platforms": {
        "khan-academy": {
            "title": "Khan Academy",
            "description": "Khan Academy ni mkusanyiko wa habari mbalimbali kuhusu masomo tofauti na ni jambo nzuri kwamba vyote vinafundisha watu kitu fulani. Tumia hii ili kupata maudhui haya yote nje ya mtandao"
        },
        "wikipedia": {
            "title": "Wikipedia",
            "description": "Wikipedia ni kamusi ya bure ya mtandaoni yenye makala ya mamilioni katika lugha nyingi. Inatoa maelezo kamili kuhusu mada yoyote na inakuwezesha kupata maudhui haya yote bila mtandao"
        },
        "w3schools": {
            "title": "W3Schools",
            "description": "W3Schools inatoa mafunzo ya bure ya maendeleo ya wavuti na marejeleo yanayoshughulikia HTML, CSS, JavaScript, Python, SQL, na lugha nyingi za programu. Ni bora kwa kujifunza ujuzi wa uandikaji wa msimbo bila mtandao"
        },
        "kolibri": {
            "title": "Kolibri",
            "description": "Kolibri ni jukwaa la kielimu la chanzo huria lililobuniwa kutoa ufikiaji wa maudhui ya kielimu bila mtandao. Linaunga mkono rasilimali mbalimbali za kielimu na linaweza kufanya kazi katika mazingira yenye rasilimali chache"
        },
        "mit-openware": {
            "title": "MIT OpenCourseWare",
            "description": "MIT OpenCourseWare ni mkusanyiko wa bure na wa wazi wa nyenzo za kozi za mtandaoni kutoka MIT. Pata maudhui ya kielimu ya ubora wa juu kutoka moja ya vyuo vikuu vinavyoongoza ulimwenguni, yanapatikana bila mtandao"
        }
    },
    "languages": {
        "english": "Kiingereza",
        "french": "Kifaransa",
        "kiswahili": "Kiswahili",
        "kinyarwanda": "Kinyarwanda"
    },
    "auth": {
        "authTitle": "Karibu Tena",
        "authSubtitle": "Ingia ili kudhibiti akaunti yako",
        "authPassword": "Nenosiri",
        "authTeacher": "Mwalimu",
        "authAdmin": "Msimamizi",
        "authLogin": "Ingia"
    },
    "AdminManageOptions": {
        "syncTitle": "Sawazisha maudhui",
        "contentTitle": "Dhibiti Maudhui",
        "manualTitle": "Mwongozo wa Mtumiaji",
        "preferenceTitle": "Mapendeleo",
        "syncSubtitle": "Angalia masasisho ya maudhui ya jumla kutoka kwenye wingu",
        "contentSubtitle": "Ficha au futa maudhui kutoka kwenye SomaBox yako",
        "manualSubtitle": "Jifunze jinsi ya kutumia lango la msimamizi",
        "preferenceSubtitle": "Dhibiti mapendeleo yako"
    },
    "AdminTable": {
        "tableTitle": "Watumiaji",
        "tableButton": "Ongeza",
        "tableNames": "Majina",
        "tableEmail": "Barua pepe",
        "tableRole": "Jukumu",
        "TableManage": "Dhibiti"
    },
    "role": {
        "teacher": "Mwalimu",
        "admin": "Msimamizi",
        "scholar": "Mwanafunzi"
    },
    "notFound": "Maudhui hayajapatikana",
    "loadingCategories": "Inapakia kategoria...",
    "exploreTopics": "Chunguza mada zilizo hapa chini",
    "notContent": "Bado hakuna maudhui hapa.",
    "noContent": "Maudhui uliyoomba hayakuweza kupakiwa",
    "thePath": "Njia",
    "doesNotExist": "Haipo",
    "goHOme": "Rudi Nyumbani",
    "learningResources": "Rasilimali za Kujifunza",
    "contentArea": "Eneo la Maudhui",
    "all": "Vyote",
    "videos": "Video",
    "audio": "Sauti",
    "books": "Vitabu"

}