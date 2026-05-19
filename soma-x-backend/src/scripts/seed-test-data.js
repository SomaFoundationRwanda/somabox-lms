import bcrypt from 'bcrypt';
import { initSchemas, localDb, serverDb } from '../helpers/db-manager.js';

// ─── core accounts ──────────────────────────────────────────────────────────

const TEACHER_EMAIL = 'teacher@mail.com';
const TEACHER_2_EMAIL = 'teacher2@mail.com';
const TEACHER_3_EMAIL = 'teacher3@mail.com';

const REQUIRED_STUDENT = {
  email: 'student@mail.com',
  fullName: 'Nadia Uwimana',
  password: 'student',
  role: 'scholar',
  schoolName: 'Kigali Primary School',
  gradeLevel: 'Grade 5',
  preferredLanguage: 'en'
};

const MOCK_STUDENTS = [
  REQUIRED_STUDENT,
  { email: 'amara@mail.com',    fullName: 'Amara Diallo',       password: 'student', role: 'scholar', schoolName: 'Kigali Primary School',    gradeLevel: 'Grade 5', preferredLanguage: 'fr' },
  { email: 'kwame@mail.com',    fullName: 'Kwame Mensah',       password: 'student', role: 'scholar', schoolName: 'Kigali Primary School',    gradeLevel: 'Grade 5', preferredLanguage: 'en' },
  { email: 'fatou@mail.com',    fullName: 'Fatou Traoré',       password: 'student', role: 'scholar', schoolName: 'Kigali Primary School',    gradeLevel: 'Grade 5', preferredLanguage: 'fr' },
  { email: 'tendai@mail.com',   fullName: 'Tendai Moyo',        password: 'student', role: 'scholar', schoolName: 'Nyamirambo Academy',       gradeLevel: 'Grade 6', preferredLanguage: 'en' },
  { email: 'aisha@mail.com',    fullName: 'Aisha Kamara',       password: 'student', role: 'scholar', schoolName: 'Nyamirambo Academy',       gradeLevel: 'Grade 6', preferredLanguage: 'en' },
  { email: 'kofi@mail.com',     fullName: 'Kofi Asante',        password: 'student', role: 'scholar', schoolName: 'Nyamirambo Academy',       gradeLevel: 'Grade 6', preferredLanguage: 'en' },
  { email: 'zainab@mail.com',   fullName: 'Zainab Hassan',      password: 'student', role: 'scholar', schoolName: 'Remera Secondary School',  gradeLevel: 'Grade 7', preferredLanguage: 'ar' },
  { email: 'chidi@mail.com',    fullName: 'Chidi Okonkwo',      password: 'student', role: 'scholar', schoolName: 'Remera Secondary School',  gradeLevel: 'Grade 7', preferredLanguage: 'en' },
  { email: 'nia@mail.com',      fullName: 'Nia Adeyemi',        password: 'student', role: 'scholar', schoolName: 'Remera Secondary School',  gradeLevel: 'Grade 7', preferredLanguage: 'en' },
  { email: 'seun@mail.com',     fullName: 'Seun Okafor',        password: 'student', role: 'scholar', schoolName: 'Gikondo High School',      gradeLevel: 'Grade 8', preferredLanguage: 'en' },
  { email: 'miriam@mail.com',   fullName: 'Miriam Njoroge',     password: 'student', role: 'scholar', schoolName: 'Gikondo High School',      gradeLevel: 'Grade 8', preferredLanguage: 'sw' },
  { email: 'emeka@mail.com',    fullName: 'Emeka Eze',          password: 'student', role: 'scholar', schoolName: 'Gikondo High School',      gradeLevel: 'Grade 8', preferredLanguage: 'en' },
  { email: 'abena@mail.com',    fullName: 'Abena Boateng',      password: 'student', role: 'scholar', schoolName: 'Kimisagara School',        gradeLevel: 'Grade 4', preferredLanguage: 'en' },
  { email: 'luc@mail.com',      fullName: 'Luc Niyonsaba',      password: 'student', role: 'scholar', schoolName: 'Kimisagara School',        gradeLevel: 'Grade 4', preferredLanguage: 'fr' },
  { email: 'grace@mail.com',    fullName: 'Grace Uwase',        password: 'student', role: 'scholar', schoolName: 'Kimisagara School',        gradeLevel: 'Grade 4', preferredLanguage: 'en' },
  { email: 'jean@mail.com',     fullName: 'Jean Habimana',      password: 'student', role: 'scholar', schoolName: 'Kacyiru Model School',     gradeLevel: 'Grade 5', preferredLanguage: 'fr' },
  { email: 'olivia@mail.com',   fullName: 'Olivia Mutoni',      password: 'student', role: 'scholar', schoolName: 'Kacyiru Model School',     gradeLevel: 'Grade 5', preferredLanguage: 'en' },
  { email: 'ibrahim@mail.com',  fullName: 'Ibrahim Sow',        password: 'student', role: 'scholar', schoolName: 'Kacyiru Model School',     gradeLevel: 'Grade 5', preferredLanguage: 'fr' },
  { email: 'adaeze@mail.com',   fullName: 'Adaeze Obi',         password: 'student', role: 'scholar', schoolName: 'Muhima Primary School',    gradeLevel: 'Grade 6', preferredLanguage: 'en' }
];

// ─── classes ─────────────────────────────────────────────────────────────────

const TEST_CLASSES = [
  {
    id: '900001',
    name: 'Mathematics — Grade 5',
    grade: 'Grade 5',
    schedule: 'Mon/Wed 09:00',
    notes: 'Core maths class covering numbers, fractions, and basic geometry.',
    teacherEmail: TEACHER_EMAIL,
    studentEmails: ['student@mail.com', 'amara@mail.com', 'kwame@mail.com', 'fatou@mail.com', 'jean@mail.com', 'olivia@mail.com', 'ibrahim@mail.com']
  },
  {
    id: '900002',
    name: 'Science — Grade 6',
    grade: 'Grade 6',
    schedule: 'Tue/Thu 11:00',
    notes: 'Intro to life sciences: plants, animals, the human body.',
    teacherEmail: TEACHER_EMAIL,
    studentEmails: ['tendai@mail.com', 'aisha@mail.com', 'kofi@mail.com', 'adaeze@mail.com']
  },
  {
    id: '900003',
    name: 'English Language — Grade 7',
    grade: 'Grade 7',
    schedule: 'Mon/Fri 08:00',
    notes: 'Reading comprehension, grammar, and essay writing.',
    teacherEmail: TEACHER_2_EMAIL,
    studentEmails: ['zainab@mail.com', 'chidi@mail.com', 'nia@mail.com', 'student@mail.com', 'amara@mail.com']
  },
  {
    id: '900004',
    name: 'History & Geography — Grade 8',
    grade: 'Grade 8',
    schedule: 'Wed/Fri 10:00',
    notes: 'African history and physical geography of the continent.',
    teacherEmail: TEACHER_2_EMAIL,
    studentEmails: ['seun@mail.com', 'miriam@mail.com', 'emeka@mail.com', 'chidi@mail.com']
  },
  {
    id: '900005',
    name: 'Primary Literacy — Grade 4',
    grade: 'Grade 4',
    schedule: 'Daily 07:30',
    notes: 'Foundational reading and writing for early learners.',
    teacherEmail: TEACHER_3_EMAIL,
    studentEmails: ['abena@mail.com', 'luc@mail.com', 'grace@mail.com']
  },
  {
    id: '900006',
    name: 'Computer Basics — Mixed',
    grade: 'Mixed',
    schedule: 'Sat 09:00',
    notes: 'Weekend digital literacy club open to all grades.',
    teacherEmail: TEACHER_EMAIL,
    studentEmails: ['student@mail.com', 'kwame@mail.com', 'kofi@mail.com', 'seun@mail.com', 'nia@mail.com', 'grace@mail.com', 'jean@mail.com', 'emeka@mail.com']
  }
];

// ─── lessons ─────────────────────────────────────────────────────────────────

const MOCK_LESSONS = [
  // ── class 900001 Mathematics ──────────────────────────────────────────────
  {
    classId: '900001',
    title: 'Fractions Warmup',
    description: 'Quick review on equivalent fractions and simple addition.',
    contentFolder: 'lessons/mock-900001-fractions',
    isVisibleToStudents: 1,
    dueInDays: -30,
    steps: [
      { stepType: 'content', title: 'What Is a Fraction?', body: 'A fraction represents part of a whole. The top number is the numerator and the bottom is the denominator. For example, 3/4 means 3 out of 4 equal parts.' },
      {
        stepType: 'question', title: 'Check Understanding', body: 'Answer the questions below.',
        metadata: { questions: [
          { prompt: 'Which pair of fractions is equivalent?', questionType: 'multiple_choice', options: ['1/2 and 2/4', '1/3 and 2/5', '2/3 and 3/5'] },
          { prompt: 'In your own words, what does "denominator" mean?', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900001',
    title: 'Addition & Subtraction of Fractions',
    description: 'Adding and subtracting fractions with like and unlike denominators.',
    contentFolder: 'lessons/mock-900001-fraction-addition',
    isVisibleToStudents: 1,
    dueInDays: -20,
    steps: [
      { stepType: 'content', title: 'Common Denominators', body: 'To add fractions, find a common denominator. For 1/3 + 1/6, the common denominator is 6, giving 2/6 + 1/6 = 3/6 = 1/2.' },
      { stepType: 'content', title: 'Worked Examples', body: 'Example 1: 2/5 + 1/5 = 3/5. Example 2: 3/4 − 1/8 = 6/8 − 1/8 = 5/8.' },
      {
        stepType: 'question', title: 'Practice', body: 'Solve these.',
        metadata: { questions: [
          { prompt: 'What is 1/4 + 2/4?', questionType: 'multiple_choice', options: ['3/4', '3/8', '2/4'] },
          { prompt: 'What is 5/6 − 1/3?', questionType: 'multiple_choice', options: ['1/2', '4/3', '4/6'] },
          { prompt: 'Show your working for: 3/8 + 1/4', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900001',
    title: 'Multiplication and Perimeter',
    description: 'Using multiplication to find the perimeter of shapes.',
    contentFolder: 'lessons/mock-900001-perimeter',
    isVisibleToStudents: 1,
    dueInDays: -10,
    steps: [
      { stepType: 'content', title: 'Perimeter Basics', body: 'The perimeter is the total distance around a shape. For a rectangle: P = 2 × (length + width).' },
      {
        stepType: 'question', title: 'Calculate It', body: 'Answer the questions.',
        metadata: { questions: [
          { prompt: 'A rectangle is 5 cm long and 3 cm wide. What is its perimeter?', questionType: 'multiple_choice', options: ['16 cm', '15 cm', '8 cm'] },
          { prompt: 'Draw and label a square with perimeter 20 cm. What is its side length?', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900001',
    title: 'Decimals and Place Value',
    description: 'Understanding tenths, hundredths, and comparing decimals.',
    contentFolder: 'lessons/mock-900001-decimals',
    isVisibleToStudents: 1,
    dueInDays: 5,
    steps: [
      { stepType: 'content', title: 'Place Value Chart', body: 'Decimals extend the place value system. 3.47 means 3 ones, 4 tenths, 7 hundredths.' },
      { stepType: 'content', title: 'Comparing Decimals', body: 'To compare, line up decimal points. 0.6 > 0.59 because 6 tenths is more than 5 tenths.' },
      {
        stepType: 'question', title: 'Decimal Quiz', body: 'Answer all questions.',
        metadata: { questions: [
          { prompt: 'Which is greater: 0.7 or 0.69?', questionType: 'multiple_choice', options: ['0.7', '0.69', 'They are equal'] },
          { prompt: 'Write 0.45 in words.', questionType: 'open', options: [] },
          { prompt: 'Round 3.76 to the nearest tenth.', questionType: 'multiple_choice', options: ['3.8', '3.7', '4.0'] }
        ]}
      }
    ]
  },
  {
    classId: '900001',
    title: 'Introduction to Geometry',
    description: 'Angles, triangles, and basic 2D shapes.',
    contentFolder: 'lessons/mock-900001-geometry',
    isVisibleToStudents: 1,
    dueInDays: 14,
    steps: [
      { stepType: 'content', title: 'Types of Angles', body: 'Acute angles are less than 90°, right angles are exactly 90°, obtuse angles are between 90° and 180°.' },
      { stepType: 'content', title: 'Triangles', body: 'Equilateral triangles have 3 equal sides. Isosceles have 2 equal sides. Scalene have no equal sides.' },
      {
        stepType: 'question', title: 'Geometry Check', body: 'Test your knowledge.',
        metadata: { questions: [
          { prompt: 'An angle of 120° is called:', questionType: 'multiple_choice', options: ['Obtuse', 'Acute', 'Right'] },
          { prompt: 'How many degrees are in a triangle?', questionType: 'multiple_choice', options: ['180°', '360°', '90°'] },
          { prompt: 'Describe the difference between equilateral and scalene triangles.', questionType: 'open', options: [] }
        ]}
      }
    ]
  },

  // ── class 900002 Science ──────────────────────────────────────────────────
  {
    classId: '900002',
    title: 'Plant Basics',
    description: 'Identify plant parts and their functions.',
    contentFolder: 'lessons/mock-900002-plants',
    isVisibleToStudents: 1,
    dueInDays: -25,
    steps: [
      { stepType: 'content', title: 'Plant Parts', body: 'Roots absorb water and minerals. Stems transport nutrients. Leaves make food through photosynthesis. Flowers for reproduction.' },
      {
        stepType: 'question', title: 'Science Questions', body: 'Answer all questions.',
        metadata: { questions: [
          { prompt: 'Which part mainly absorbs water from soil?', questionType: 'multiple_choice', options: ['Leaf', 'Root', 'Flower'] },
          { prompt: 'Why are leaves important?', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900002',
    title: 'Photosynthesis in Depth',
    description: 'How plants convert light into energy.',
    contentFolder: 'lessons/mock-900002-photosynthesis',
    isVisibleToStudents: 1,
    dueInDays: -15,
    steps: [
      { stepType: 'content', title: 'The Process', body: 'Photosynthesis: CO₂ + H₂O + sunlight → glucose + O₂. Chlorophyll in leaves captures light energy.' },
      { stepType: 'content', title: 'Why It Matters', body: 'Photosynthesis produces oxygen for all living things and forms the base of all food chains.' },
      {
        stepType: 'question', title: 'Quiz', body: 'Answer the questions.',
        metadata: { questions: [
          { prompt: 'What gas do plants take in for photosynthesis?', questionType: 'multiple_choice', options: ['Carbon dioxide', 'Oxygen', 'Nitrogen'] },
          { prompt: 'What is chlorophyll?', questionType: 'open', options: [] },
          { prompt: 'Which of these is a product of photosynthesis?', questionType: 'multiple_choice', options: ['Oxygen', 'Carbon dioxide', 'Water'] }
        ]}
      }
    ]
  },
  {
    classId: '900002',
    title: 'The Human Digestive System',
    description: 'How food moves through and is processed in the body.',
    contentFolder: 'lessons/mock-900002-digestion',
    isVisibleToStudents: 1,
    dueInDays: -5,
    steps: [
      { stepType: 'content', title: 'Organs of Digestion', body: 'Mouth → oesophagus → stomach → small intestine → large intestine → rectum. Each organ has a specific job.' },
      { stepType: 'content', title: 'Enzymes', body: 'Enzymes are chemical helpers that break food into nutrients. Saliva contains amylase, which breaks down starch.' },
      {
        stepType: 'question', title: 'Digestion Quiz', body: 'Answer the questions.',
        metadata: { questions: [
          { prompt: 'Where does most nutrient absorption happen?', questionType: 'multiple_choice', options: ['Small intestine', 'Stomach', 'Large intestine'] },
          { prompt: 'What is the role of enzymes in digestion?', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900002',
    title: 'Ecosystems and Food Chains',
    description: 'Producers, consumers, and decomposers in an ecosystem.',
    contentFolder: 'lessons/mock-900002-ecosystems',
    isVisibleToStudents: 1,
    dueInDays: 7,
    steps: [
      { stepType: 'content', title: 'Food Chains', body: 'Grass → Grasshopper → Frog → Snake → Eagle. Energy flows from producers (plants) to consumers.' },
      { stepType: 'content', title: 'Decomposers', body: 'Bacteria and fungi break down dead matter and return nutrients to the soil, completing the cycle.' },
      {
        stepType: 'question', title: 'Ecosystem Questions', body: 'Think carefully.',
        metadata: { questions: [
          { prompt: 'What is a producer in a food chain?', questionType: 'multiple_choice', options: ['A plant', 'A lion', 'A fungus'] },
          { prompt: 'What would happen if all decomposers disappeared?', questionType: 'open', options: [] },
          { prompt: 'Which organism gets the most energy in a food chain?', questionType: 'multiple_choice', options: ['The producer', 'The top predator', 'The decomposer'] }
        ]}
      }
    ]
  },

  // ── class 900003 English Language ────────────────────────────────────────
  {
    classId: '900003',
    title: 'Reading Comprehension: The River',
    description: 'Read a short passage and answer comprehension questions.',
    contentFolder: 'lessons/mock-900003-river-passage',
    isVisibleToStudents: 1,
    dueInDays: -20,
    steps: [
      { stepType: 'content', title: 'The River — Passage', body: '"The river ran silver through the hills, carrying stories from the mountains above. Children played on its banks, and fishermen cast their nets before dawn. The river gave life to the village — water for crops, fish for food, and songs for evenings."' },
      {
        stepType: 'question', title: 'Comprehension', body: 'Answer these questions.',
        metadata: { questions: [
          { prompt: 'What does the phrase "carrying stories from the mountains" suggest?', questionType: 'open', options: [] },
          { prompt: 'What are THREE things the river gives the village?', questionType: 'open', options: [] },
          { prompt: 'The mood of this passage is:', questionType: 'multiple_choice', options: ['Peaceful and positive', 'Tense and fearful', 'Sad and lonely'] }
        ]}
      }
    ]
  },
  {
    classId: '900003',
    title: 'Parts of Speech',
    description: 'Nouns, verbs, adjectives, and adverbs.',
    contentFolder: 'lessons/mock-900003-parts-of-speech',
    isVisibleToStudents: 1,
    dueInDays: -12,
    steps: [
      { stepType: 'content', title: 'The Four Main Parts', body: 'Noun: names a person, place, or thing. Verb: shows action or state. Adjective: describes a noun. Adverb: describes a verb or adjective.' },
      { stepType: 'content', title: 'Examples', body: '"The happy child ran quickly." — child (noun), ran (verb), happy (adjective), quickly (adverb).' },
      {
        stepType: 'question', title: 'Identify the Parts', body: 'Label these words.',
        metadata: { questions: [
          { prompt: 'In "The tall tree fell suddenly" — what part of speech is "suddenly"?', questionType: 'multiple_choice', options: ['Adverb', 'Adjective', 'Noun'] },
          { prompt: 'Write a sentence using all four parts of speech and underline each one.', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900003',
    title: 'Essay Writing: Structure',
    description: 'Introduction, body paragraphs, and conclusion.',
    contentFolder: 'lessons/mock-900003-essay-structure',
    isVisibleToStudents: 1,
    dueInDays: 0,
    steps: [
      { stepType: 'content', title: 'The Three-Part Essay', body: 'Introduction: Hook + background + thesis. Body: 2–3 paragraphs each with a topic sentence, evidence, and analysis. Conclusion: Restate thesis + final thought.' },
      { stepType: 'content', title: 'Transition Words', body: 'Use: Furthermore, However, In addition, Therefore, On the other hand — to connect ideas smoothly.' },
      {
        stepType: 'question', title: 'Essay Planning', body: 'Plan your essay.',
        metadata: { questions: [
          { prompt: 'Write a thesis statement for the topic: "Technology helps students learn."', questionType: 'open', options: [] },
          { prompt: 'Which of these is a good topic sentence?', questionType: 'multiple_choice', options: ['Technology improves access to information.', 'I like technology.', 'Technology is good.'] },
          { prompt: 'List 3 transition words you would use in your essay.', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900003',
    title: 'Spelling & Vocabulary: Unit 4',
    description: 'This week\'s vocabulary words in context.',
    contentFolder: 'lessons/mock-900003-vocab-unit4',
    isVisibleToStudents: 1,
    dueInDays: 10,
    steps: [
      { stepType: 'content', title: 'Vocabulary List', body: 'ambitious, collaborate, consequence, eloquent, persevere. Learn each word\'s meaning and spelling.' },
      {
        stepType: 'question', title: 'Vocabulary in Context', body: 'Use each word correctly.',
        metadata: { questions: [
          { prompt: 'Fill in the blank: She was very ____ and dreamed of becoming a doctor.', questionType: 'multiple_choice', options: ['ambitious', 'eloquent', 'collaborate'] },
          { prompt: 'Write your own sentence using the word "persevere".', questionType: 'open', options: [] },
          { prompt: '"Eloquent" means:', questionType: 'multiple_choice', options: ['Speaking clearly and persuasively', 'Working hard', 'Causing harm'] }
        ]}
      }
    ]
  },

  // ── class 900004 History & Geography ─────────────────────────────────────
  {
    classId: '900004',
    title: 'Pre-Colonial African Kingdoms',
    description: 'Great kingdoms of Africa before European colonisation.',
    contentFolder: 'lessons/mock-900004-kingdoms',
    isVisibleToStudents: 1,
    dueInDays: -18,
    steps: [
      { stepType: 'content', title: 'Major Kingdoms', body: 'Mali Empire (1235–1600): known for wealth and Mansa Musa. Great Zimbabwe (1100–1450): stone architecture. Kingdom of Kongo (1390–1914): trade and diplomacy.' },
      {
        stepType: 'question', title: 'History Questions', body: 'Show what you know.',
        metadata: { questions: [
          { prompt: 'Which empire was Mansa Musa associated with?', questionType: 'multiple_choice', options: ['Mali Empire', 'Great Zimbabwe', 'Kingdom of Kongo'] },
          { prompt: 'Why were pre-colonial African kingdoms significant?', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900004',
    title: 'Physical Geography: African Rivers',
    description: 'The Nile, Congo, Niger, and Zambezi rivers and their importance.',
    contentFolder: 'lessons/mock-900004-rivers',
    isVisibleToStudents: 1,
    dueInDays: -8,
    steps: [
      { stepType: 'content', title: 'Major Rivers', body: 'Nile (6,650 km): longest river, flows north through Sudan and Egypt. Congo: largest by discharge. Niger: vital for West Africa. Zambezi: home of Victoria Falls.' },
      { stepType: 'content', title: 'River Uses', body: 'Rivers provide water for agriculture, serve as transport routes, generate hydroelectric power, and support fisheries.' },
      {
        stepType: 'question', title: 'River Geography', body: 'Answer the questions.',
        metadata: { questions: [
          { prompt: 'Which is the longest river in Africa?', questionType: 'multiple_choice', options: ['Nile', 'Congo', 'Niger'] },
          { prompt: 'Name two ways African rivers support human life.', questionType: 'open', options: [] },
          { prompt: 'Victoria Falls is on which river?', questionType: 'multiple_choice', options: ['Zambezi', 'Niger', 'Nile'] }
        ]}
      }
    ]
  },
  {
    classId: '900004',
    title: 'Colonialism in Africa',
    description: 'The Scramble for Africa and its consequences.',
    contentFolder: 'lessons/mock-900004-colonialism',
    isVisibleToStudents: 1,
    dueInDays: 6,
    steps: [
      { stepType: 'content', title: 'The Berlin Conference (1884–1885)', body: 'European powers divided Africa without consulting Africans. This created artificial borders that split ethnic groups and joined rival peoples.' },
      { stepType: 'content', title: 'Resistance', body: 'Africans resisted colonialism: Ethiopia defeated Italy at Adwa (1896). The Battle of Isandlwана — Zulus defeated the British (1879).' },
      {
        stepType: 'question', title: 'Colonialism Questions', body: 'Critical thinking required.',
        metadata: { questions: [
          { prompt: 'What year did the Berlin Conference take place?', questionType: 'multiple_choice', options: ['1884', '1900', '1776'] },
          { prompt: 'Explain one negative consequence of colonial borders.', questionType: 'open', options: [] },
          { prompt: 'Which African country successfully resisted Italian colonisation?', questionType: 'multiple_choice', options: ['Ethiopia', 'Nigeria', 'South Africa'] }
        ]}
      }
    ]
  },

  // ── class 900005 Primary Literacy ────────────────────────────────────────
  {
    classId: '900005',
    title: 'Alphabet and Phonics',
    description: 'Letter sounds and blending simple words.',
    contentFolder: 'lessons/mock-900005-phonics',
    isVisibleToStudents: 1,
    dueInDays: -30,
    steps: [
      { stepType: 'content', title: 'Letter Sounds', body: 'Every letter has a sound. A says /æ/ as in "apple". B says /b/ as in "ball". C says /k/ as in "cat". Practice each sound out loud.' },
      { stepType: 'content', title: 'Blending', body: 'Put sounds together: c-a-t = "cat". s-u-n = "sun". Practice blending 3-letter words.' },
      {
        stepType: 'question', title: 'Phonics Practice', body: 'Answer the questions.',
        metadata: { questions: [
          { prompt: 'Which picture starts with the /b/ sound?', questionType: 'multiple_choice', options: ['Ball', 'Cat', 'Fish'] },
          { prompt: 'Blend these sounds: d-o-g. What word is it?', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900005',
    title: 'Reading Simple Sentences',
    description: 'Reading and understanding short sentences.',
    contentFolder: 'lessons/mock-900005-simple-reading',
    isVisibleToStudents: 1,
    dueInDays: -15,
    steps: [
      { stepType: 'content', title: 'Sight Words', body: 'Memorise these words: the, is, in, a, and, to, it, he, she, we.' },
      { stepType: 'content', title: 'Story: The Dog', body: '"The dog is big. The dog can run. The dog is my friend."' },
      {
        stepType: 'question', title: 'Reading Check', body: 'Answer about the story.',
        metadata: { questions: [
          { prompt: 'What is the dog like?', questionType: 'multiple_choice', options: ['Big', 'Small', 'Sad'] },
          { prompt: 'Write one sentence about an animal you know.', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900005',
    title: 'Writing My Name and Address',
    description: 'Practise writing personal information clearly.',
    contentFolder: 'lessons/mock-900005-personal-info',
    isVisibleToStudents: 1,
    dueInDays: 7,
    steps: [
      { stepType: 'content', title: 'Personal Information', body: 'Your name, school, and address are important information. Always write them neatly and clearly.' },
      {
        stepType: 'question', title: 'Write It', body: 'Answer the questions.',
        metadata: { questions: [
          { prompt: 'Write your full name here.', questionType: 'open', options: [] },
          { prompt: 'Write the name of your school.', questionType: 'open', options: [] }
        ]}
      }
    ]
  },

  // ── class 900006 Computer Basics ─────────────────────────────────────────
  {
    classId: '900006',
    title: 'What is a Computer?',
    description: 'Parts of a computer and what they do.',
    contentFolder: 'lessons/mock-900006-computer-intro',
    isVisibleToStudents: 1,
    dueInDays: -22,
    steps: [
      { stepType: 'content', title: 'Main Components', body: 'CPU: the "brain" of the computer. RAM: short-term memory. Hard Drive: long-term storage. Monitor: screen. Keyboard and mouse: input devices.' },
      { stepType: 'content', title: 'Input vs Output', body: 'Input devices send information TO the computer (keyboard, mouse, microphone). Output devices receive information FROM the computer (monitor, speaker, printer).' },
      {
        stepType: 'question', title: 'Computer Quiz', body: 'Test your knowledge.',
        metadata: { questions: [
          { prompt: 'What is the CPU often called?', questionType: 'multiple_choice', options: ['The brain', 'The memory', 'The screen'] },
          { prompt: 'Is a printer an input or output device?', questionType: 'multiple_choice', options: ['Output', 'Input', 'Both'] },
          { prompt: 'Name two input devices you have used.', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900006',
    title: 'Introduction to the Internet',
    description: 'How the internet works and staying safe online.',
    contentFolder: 'lessons/mock-900006-internet',
    isVisibleToStudents: 1,
    dueInDays: -10,
    steps: [
      { stepType: 'content', title: 'How the Internet Works', body: 'The internet is a global network of computers connected by cables and wireless signals. Websites are stored on servers and accessed through browsers.' },
      { stepType: 'content', title: 'Online Safety', body: 'Never share your personal information online. Use strong passwords. If something makes you uncomfortable, tell a trusted adult.' },
      {
        stepType: 'question', title: 'Internet Safety Check', body: 'Answer the questions.',
        metadata: { questions: [
          { prompt: 'What should you NOT share online?', questionType: 'multiple_choice', options: ['Personal information', 'Your favourite colour', 'A drawing you made'] },
          { prompt: 'What is a browser? Give an example.', questionType: 'open', options: [] }
        ]}
      }
    ]
  },
  {
    classId: '900006',
    title: 'Typing and Keyboard Skills',
    description: 'Correct finger placement and basic keyboard shortcuts.',
    contentFolder: 'lessons/mock-900006-typing',
    isVisibleToStudents: 1,
    dueInDays: 5,
    steps: [
      { stepType: 'content', title: 'Home Row Keys', body: 'Left hand: A, S, D, F. Right hand: J, K, L, ;. Always return your fingers to the home row after pressing other keys.' },
      { stepType: 'content', title: 'Useful Shortcuts', body: 'Ctrl+C = Copy. Ctrl+V = Paste. Ctrl+Z = Undo. Ctrl+S = Save. Practise each one.' },
      {
        stepType: 'question', title: 'Keyboard Quiz', body: 'Answer the questions.',
        metadata: { questions: [
          { prompt: 'What shortcut do you press to copy text?', questionType: 'multiple_choice', options: ['Ctrl+C', 'Ctrl+V', 'Ctrl+Z'] },
          { prompt: 'What are the home row keys for the left hand?', questionType: 'multiple_choice', options: ['A, S, D, F', 'Q, W, E, R', 'Z, X, C, V'] },
          { prompt: 'Why is it important to use the correct finger placement when typing?', questionType: 'open', options: [] }
        ]}
      }
    ]
  }
];

// ─── lesson progress simulation ──────────────────────────────────────────────
// Defines realistic progress states for each student across past lessons

const LESSON_PROGRESS_OVERRIDES = [
  // Nadia — strong student, completed most
  { email: 'student@mail.com',  folder: 'lessons/mock-900001-fractions',         status: 'completed', currentStep: 2, daysAgo: 28 },
  { email: 'student@mail.com',  folder: 'lessons/mock-900001-fraction-addition',  status: 'completed', currentStep: 3, daysAgo: 18 },
  { email: 'student@mail.com',  folder: 'lessons/mock-900001-perimeter',          status: 'completed', currentStep: 2, daysAgo: 8  },
  { email: 'student@mail.com',  folder: 'lessons/mock-900001-decimals',           status: 'in_progress', currentStep: 2, daysAgo: 3 },
  { email: 'student@mail.com',  folder: 'lessons/mock-900003-river-passage',      status: 'completed', currentStep: 2, daysAgo: 18 },
  { email: 'student@mail.com',  folder: 'lessons/mock-900003-parts-of-speech',    status: 'completed', currentStep: 3, daysAgo: 10 },
  { email: 'student@mail.com',  folder: 'lessons/mock-900003-essay-structure',    status: 'in_progress', currentStep: 2, daysAgo: 1 },
  { email: 'student@mail.com',  folder: 'lessons/mock-900006-computer-intro',     status: 'completed', currentStep: 3, daysAgo: 20 },
  { email: 'student@mail.com',  folder: 'lessons/mock-900006-internet',           status: 'completed', currentStep: 3, daysAgo: 8  },

  // Amara
  { email: 'amara@mail.com',    folder: 'lessons/mock-900001-fractions',         status: 'completed', currentStep: 2, daysAgo: 27 },
  { email: 'amara@mail.com',    folder: 'lessons/mock-900001-fraction-addition',  status: 'completed', currentStep: 3, daysAgo: 17 },
  { email: 'amara@mail.com',    folder: 'lessons/mock-900001-perimeter',          status: 'in_progress', currentStep: 1, daysAgo: 5 },
  { email: 'amara@mail.com',    folder: 'lessons/mock-900003-river-passage',      status: 'completed', currentStep: 2, daysAgo: 19 },
  { email: 'amara@mail.com',    folder: 'lessons/mock-900003-parts-of-speech',    status: 'in_progress', currentStep: 2, daysAgo: 9 },

  // Kwame
  { email: 'kwame@mail.com',    folder: 'lessons/mock-900001-fractions',         status: 'completed', currentStep: 2, daysAgo: 29 },
  { email: 'kwame@mail.com',    folder: 'lessons/mock-900001-fraction-addition',  status: 'completed', currentStep: 3, daysAgo: 19 },
  { email: 'kwame@mail.com',    folder: 'lessons/mock-900001-perimeter',          status: 'completed', currentStep: 2, daysAgo: 9  },
  { email: 'kwame@mail.com',    folder: 'lessons/mock-900006-computer-intro',     status: 'completed', currentStep: 3, daysAgo: 21 },
  { email: 'kwame@mail.com',    folder: 'lessons/mock-900006-internet',           status: 'completed', currentStep: 3, daysAgo: 9  },

  // Fatou
  { email: 'fatou@mail.com',    folder: 'lessons/mock-900001-fractions',         status: 'completed', currentStep: 2, daysAgo: 26 },
  { email: 'fatou@mail.com',    folder: 'lessons/mock-900001-fraction-addition',  status: 'in_progress', currentStep: 2, daysAgo: 14 },

  // Tendai
  { email: 'tendai@mail.com',   folder: 'lessons/mock-900002-plants',             status: 'completed', currentStep: 2, daysAgo: 23 },
  { email: 'tendai@mail.com',   folder: 'lessons/mock-900002-photosynthesis',     status: 'completed', currentStep: 3, daysAgo: 13 },
  { email: 'tendai@mail.com',   folder: 'lessons/mock-900002-digestion',          status: 'completed', currentStep: 3, daysAgo: 4  },

  // Aisha
  { email: 'aisha@mail.com',    folder: 'lessons/mock-900002-plants',             status: 'completed', currentStep: 2, daysAgo: 22 },
  { email: 'aisha@mail.com',    folder: 'lessons/mock-900002-photosynthesis',     status: 'completed', currentStep: 3, daysAgo: 12 },
  { email: 'aisha@mail.com',    folder: 'lessons/mock-900002-digestion',          status: 'in_progress', currentStep: 2, daysAgo: 3 },

  // Kofi
  { email: 'kofi@mail.com',     folder: 'lessons/mock-900002-plants',             status: 'completed', currentStep: 2, daysAgo: 24 },
  { email: 'kofi@mail.com',     folder: 'lessons/mock-900002-photosynthesis',     status: 'in_progress', currentStep: 2, daysAgo: 11 },
  { email: 'kofi@mail.com',     folder: 'lessons/mock-900006-computer-intro',     status: 'completed', currentStep: 3, daysAgo: 19 },
  { email: 'kofi@mail.com',     folder: 'lessons/mock-900006-internet',           status: 'in_progress', currentStep: 2, daysAgo: 7 },

  // Zainab
  { email: 'zainab@mail.com',   folder: 'lessons/mock-900003-river-passage',      status: 'completed', currentStep: 2, daysAgo: 18 },
  { email: 'zainab@mail.com',   folder: 'lessons/mock-900003-parts-of-speech',    status: 'completed', currentStep: 3, daysAgo: 10 },
  { email: 'zainab@mail.com',   folder: 'lessons/mock-900003-essay-structure',    status: 'completed', currentStep: 3, daysAgo: 1  },

  // Chidi
  { email: 'chidi@mail.com',    folder: 'lessons/mock-900003-river-passage',      status: 'completed', currentStep: 2, daysAgo: 17 },
  { email: 'chidi@mail.com',    folder: 'lessons/mock-900003-parts-of-speech',    status: 'in_progress', currentStep: 2, daysAgo: 9 },
  { email: 'chidi@mail.com',    folder: 'lessons/mock-900004-kingdoms',           status: 'completed', currentStep: 2, daysAgo: 16 },
  { email: 'chidi@mail.com',    folder: 'lessons/mock-900004-rivers',             status: 'completed', currentStep: 3, daysAgo: 7  },

  // Nia
  { email: 'nia@mail.com',      folder: 'lessons/mock-900003-river-passage',      status: 'completed', currentStep: 2, daysAgo: 19 },
  { email: 'nia@mail.com',      folder: 'lessons/mock-900003-parts-of-speech',    status: 'completed', currentStep: 3, daysAgo: 11 },
  { email: 'nia@mail.com',      folder: 'lessons/mock-900003-essay-structure',    status: 'in_progress', currentStep: 1, daysAgo: 1 },
  { email: 'nia@mail.com',      folder: 'lessons/mock-900006-computer-intro',     status: 'completed', currentStep: 3, daysAgo: 20 },
  { email: 'nia@mail.com',      folder: 'lessons/mock-900006-internet',           status: 'completed', currentStep: 3, daysAgo: 8  },

  // Seun
  { email: 'seun@mail.com',     folder: 'lessons/mock-900004-kingdoms',           status: 'completed', currentStep: 2, daysAgo: 16 },
  { email: 'seun@mail.com',     folder: 'lessons/mock-900004-rivers',             status: 'completed', currentStep: 3, daysAgo: 6  },
  { email: 'seun@mail.com',     folder: 'lessons/mock-900006-computer-intro',     status: 'completed', currentStep: 3, daysAgo: 21 },
  { email: 'seun@mail.com',     folder: 'lessons/mock-900006-internet',           status: 'completed', currentStep: 3, daysAgo: 9  },

  // Miriam
  { email: 'miriam@mail.com',   folder: 'lessons/mock-900004-kingdoms',           status: 'completed', currentStep: 2, daysAgo: 15 },
  { email: 'miriam@mail.com',   folder: 'lessons/mock-900004-rivers',             status: 'in_progress', currentStep: 2, daysAgo: 5 },

  // Emeka
  { email: 'emeka@mail.com',    folder: 'lessons/mock-900004-kingdoms',           status: 'completed', currentStep: 2, daysAgo: 17 },
  { email: 'emeka@mail.com',    folder: 'lessons/mock-900004-rivers',             status: 'completed', currentStep: 3, daysAgo: 7  },
  { email: 'emeka@mail.com',    folder: 'lessons/mock-900006-computer-intro',     status: 'completed', currentStep: 3, daysAgo: 20 },
  { email: 'emeka@mail.com',    folder: 'lessons/mock-900006-internet',           status: 'completed', currentStep: 3, daysAgo: 8  },

  // Abena
  { email: 'abena@mail.com',    folder: 'lessons/mock-900005-phonics',            status: 'completed', currentStep: 3, daysAgo: 28 },
  { email: 'abena@mail.com',    folder: 'lessons/mock-900005-simple-reading',     status: 'completed', currentStep: 3, daysAgo: 13 },

  // Luc
  { email: 'luc@mail.com',      folder: 'lessons/mock-900005-phonics',            status: 'completed', currentStep: 3, daysAgo: 27 },
  { email: 'luc@mail.com',      folder: 'lessons/mock-900005-simple-reading',     status: 'in_progress', currentStep: 2, daysAgo: 12 },

  // Grace
  { email: 'grace@mail.com',    folder: 'lessons/mock-900005-phonics',            status: 'completed', currentStep: 3, daysAgo: 29 },
  { email: 'grace@mail.com',    folder: 'lessons/mock-900005-simple-reading',     status: 'completed', currentStep: 3, daysAgo: 14 },
  { email: 'grace@mail.com',    folder: 'lessons/mock-900006-computer-intro',     status: 'in_progress', currentStep: 1, daysAgo: 6 },

  // Jean
  { email: 'jean@mail.com',     folder: 'lessons/mock-900001-fractions',         status: 'completed', currentStep: 2, daysAgo: 25 },
  { email: 'jean@mail.com',     folder: 'lessons/mock-900001-fraction-addition',  status: 'completed', currentStep: 3, daysAgo: 16 },
  { email: 'jean@mail.com',     folder: 'lessons/mock-900001-perimeter',          status: 'completed', currentStep: 2, daysAgo: 7  },
  { email: 'jean@mail.com',     folder: 'lessons/mock-900006-computer-intro',     status: 'completed', currentStep: 3, daysAgo: 21 },

  // Olivia
  { email: 'olivia@mail.com',   folder: 'lessons/mock-900001-fractions',         status: 'completed', currentStep: 2, daysAgo: 27 },
  { email: 'olivia@mail.com',   folder: 'lessons/mock-900001-fraction-addition',  status: 'completed', currentStep: 3, daysAgo: 18 },
  { email: 'olivia@mail.com',   folder: 'lessons/mock-900001-perimeter',          status: 'completed', currentStep: 2, daysAgo: 9  },
  { email: 'olivia@mail.com',   folder: 'lessons/mock-900001-decimals',           status: 'completed', currentStep: 3, daysAgo: 2  },

  // Ibrahim
  { email: 'ibrahim@mail.com',  folder: 'lessons/mock-900001-fractions',         status: 'completed', currentStep: 2, daysAgo: 26 },
  { email: 'ibrahim@mail.com',  folder: 'lessons/mock-900001-fraction-addition',  status: 'in_progress', currentStep: 1, daysAgo: 16 },

  // Adaeze
  { email: 'adaeze@mail.com',   folder: 'lessons/mock-900002-plants',             status: 'completed', currentStep: 2, daysAgo: 23 },
  { email: 'adaeze@mail.com',   folder: 'lessons/mock-900002-photosynthesis',     status: 'completed', currentStep: 3, daysAgo: 13 },
  { email: 'adaeze@mail.com',   folder: 'lessons/mock-900002-digestion',          status: 'completed', currentStep: 3, daysAgo: 4  }
];

const SAMPLE_SUBMISSIONS = [
  {
    email: 'student@mail.com',
    folder: 'lessons/mock-900001-fractions',
    submittedAt: daysAgoISO(25),
    isLocked: 1,
    grade: 92,
    totalPoints: 100,
    gradedBy: TEACHER_EMAIL,
    gradedAt: daysAgoISO(24),
    responses: [
      {
        stepOrder: 2,
        questionIndex: 0,
        responseText: '1/2 and 2/4',
        selectedOption: '1/2 and 2/4'
      },
      {
        stepOrder: 2,
        questionIndex: 1,
        responseText: 'A denominator shows how many equal parts are in the whole.',
        selectedOption: ''
      }
    ],
    feedback: [
      {
        stepOrder: 2,
        questionIndex: 0,
        commentText: 'Great choice, this is the correct equivalent fraction.',
        awardedPoints: 5,
        possiblePoints: 5
      },
      {
        stepOrder: 2,
        questionIndex: 1,
        commentText: 'Nice explanation of the denominator in your own words.',
        awardedPoints: 5,
        possiblePoints: 5
      }
    ]
  },
  {
    email: 'emeka@mail.com',
    folder: 'lessons/mock-900006-computer-intro',
    submittedAt: daysAgoISO(5),
    isLocked: 1,
    grade: 88,
    totalPoints: 100,
    gradedBy: TEACHER_EMAIL,
    gradedAt: daysAgoISO(4),
    responses: [
      {
        stepOrder: 3,
        questionIndex: 0,
        responseText: 'The brain',
        selectedOption: 'The brain'
      },
      {
        stepOrder: 3,
        questionIndex: 1,
        responseText: 'Output',
        selectedOption: 'Output'
      },
      {
        stepOrder: 3,
        questionIndex: 2,
        responseText: 'Keyboard and mouse',
        selectedOption: ''
      }
    ],
    feedback: [
      {
        stepOrder: 3,
        questionIndex: 0,
        commentText: 'Correct — the CPU is often called the brain of the computer.',
        awardedPoints: 5,
        possiblePoints: 5
      },
      {
        stepOrder: 3,
        questionIndex: 1,
        commentText: 'Yes, a printer is an output device.',
        awardedPoints: 5,
        possiblePoints: 5
      },
      {
        stepOrder: 3,
        questionIndex: 2,
        commentText: 'Good examples of input devices.',
        awardedPoints: 5,
        possiblePoints: 5
      }
    ]
  },
  {
    email: 'emeka@mail.com',
    folder: 'lessons/mock-900004-kingdoms',
    submittedAt: daysAgoISO(17),
    isLocked: 1,
    grade: 90,
    totalPoints: 100,
    gradedBy: TEACHER_EMAIL,
    gradedAt: daysAgoISO(16),
    responses: [
      {
        stepOrder: 2,
        questionIndex: 0,
        responseText: 'Mali Empire',
        selectedOption: 'Mali Empire'
      },
      {
        stepOrder: 2,
        questionIndex: 1,
        responseText: 'They were important centres of trade, learning, and culture before colonial times.',
        selectedOption: ''
      }
    ],
    feedback: [
      {
        stepOrder: 2,
        questionIndex: 0,
        commentText: 'Correct — Mansa Musa ruled the Mali Empire.',
        awardedPoints: 5,
        possiblePoints: 5
      },
      {
        stepOrder: 2,
        questionIndex: 1,
        commentText: 'Nice answer — these kingdoms were rich in culture and trade.',
        awardedPoints: 5,
        possiblePoints: 5
      }
    ]
  },
  {
    email: 'emeka@mail.com',
    folder: 'lessons/mock-900004-rivers',
    submittedAt: daysAgoISO(7),
    isLocked: 1,
    grade: 92,
    totalPoints: 100,
    gradedBy: TEACHER_EMAIL,
    gradedAt: daysAgoISO(6),
    responses: [
      {
        stepOrder: 3,
        questionIndex: 0,
        responseText: 'Nile',
        selectedOption: 'Nile'
      },
      {
        stepOrder: 3,
        questionIndex: 1,
        responseText: 'They give water for farming and provide transport routes.',
        selectedOption: ''
      },
      {
        stepOrder: 3,
        questionIndex: 2,
        responseText: 'Zambezi',
        selectedOption: 'Zambezi'
      }
    ],
    feedback: [
      {
        stepOrder: 3,
        questionIndex: 0,
        commentText: 'Yes, the Nile is the longest river in Africa.',
        awardedPoints: 5,
        possiblePoints: 5
      },
      {
        stepOrder: 3,
        questionIndex: 1,
        commentText: 'Good examples of how rivers support life.',
        awardedPoints: 5,
        possiblePoints: 5
      },
      {
        stepOrder: 3,
        questionIndex: 2,
        commentText: 'Correct — Victoria Falls is on the Zambezi.',
        awardedPoints: 5,
        possiblePoints: 5
      }
    ]
  }
];

function createSampleSubmissions(lessonIdByFolder) {
  const findSubmission = localDb.prepare(`SELECT id FROM lesson_submissions WHERE lesson_id = ? AND scholar_email = ?`);
  const insertSubmission = localDb.prepare(`INSERT INTO lesson_submissions (lesson_id, scholar_email, submitted_at, is_locked) VALUES (?, ?, ?, ?)`);
  const updateSubmission = localDb.prepare(`UPDATE lesson_submissions SET submitted_at = ?, is_locked = ? WHERE id = ?`);
  const deleteResponses = localDb.prepare(`DELETE FROM class_lesson_question_responses WHERE lesson_id = ? AND scholar_email = ?`);
  const deleteGrades = localDb.prepare(`DELETE FROM lesson_grades WHERE submission_id = ?`);
  const deleteFeedback = localDb.prepare(`DELETE FROM lesson_feedback_comments WHERE submission_id = ?`);
  const insertResponse = localDb.prepare(`INSERT INTO class_lesson_question_responses (lesson_id, step_id, scholar_email, question_index, response_text, selected_option) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertGrade = localDb.prepare(`INSERT INTO lesson_grades (submission_id, grade, total_points, graded_by_teacher_email, graded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertFeedback = localDb.prepare(`INSERT INTO lesson_feedback_comments (submission_id, teacher_email, comment_text, awarded_points, possible_points, step_id, question_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const sample of SAMPLE_SUBMISSIONS) {
    const lessonId = lessonIdByFolder[sample.folder]
    if (!lessonId) continue

    const existing = findSubmission.get(lessonId, sample.email)
    let submissionId

    if (existing) {
      submissionId = existing.id
      updateSubmission.run(sample.submittedAt, Number(sample.isLocked), submissionId)
    } else {
      const result = insertSubmission.run(lessonId, sample.email, sample.submittedAt, Number(sample.isLocked))
      submissionId = result.lastInsertRowid
    }

    deleteResponses.run(lessonId, sample.email)
    deleteGrades.run(submissionId)
    deleteFeedback.run(submissionId)

    const stepRows = localDb.prepare(`SELECT id, step_order FROM class_lesson_steps WHERE lesson_id = ?`).all(lessonId)
    const stepIdByOrder = Object.fromEntries(stepRows.map((row) => [row.step_order, row.id]))

    for (const response of sample.responses || []) {
      const stepId = stepIdByOrder[response.stepOrder]
      if (!stepId) continue
      insertResponse.run(
        lessonId,
        stepId,
        sample.email,
        response.questionIndex,
        response.responseText || null,
        response.selectedOption || null
      )
    }

    if (sample.grade != null && sample.totalPoints != null) {
      insertGrade.run(
        submissionId,
        sample.grade,
        sample.totalPoints,
        sample.gradedBy,
        sample.gradedAt || sample.submittedAt,
        sample.gradedAt || sample.submittedAt
      )
    }

    for (const feedbackItem of sample.feedback || []) {
      const stepId = stepIdByOrder[feedbackItem.stepOrder] || null
      insertFeedback.run(
        submissionId,
        TEACHER_EMAIL,
        feedbackItem.commentText,
        feedbackItem.awardedPoints,
        feedbackItem.possiblePoints,
        stepId,
        feedbackItem.questionIndex,
        feedbackItem.createdAt || sample.gradedAt || sample.submittedAt,
        feedbackItem.createdAt || sample.gradedAt || sample.submittedAt
      )
    }
  }
}

function toDueAt(daysFromNow = 7) {
  const date = new Date();
  date.setDate(date.getDate() + Number(daysFromNow || 0));
  return date.toISOString();
}

function daysAgoISO(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

async function upsertUser({ email, fullName, password, role, schoolName, gradeLevel, preferredLanguage }) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = role.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const existingUser = serverDb
    .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)')
    .get(normalizedEmail);

  if (existingUser) {
    serverDb
      .prepare(
        `UPDATE users
         SET email = ?, full_name = ?, password_hash = ?, role = ?,
             school_name = ?, grade_level = ?, preferred_language = ?
         WHERE id = ?`
      )
      .run(normalizedEmail, fullName, passwordHash, normalizedRole,
           schoolName || null, gradeLevel || null, preferredLanguage || null,
           existingUser.id);
    return;
  }

  serverDb
    .prepare(
      `INSERT INTO users (email, full_name, password_hash, role, school_name, grade_level, preferred_language)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(normalizedEmail, fullName, passwordHash, normalizedRole,
         schoolName || null, gradeLevel || null, preferredLanguage || null);
}

function upsertClass(testClass, teacherEmail) {
  localDb
    .prepare(
      `INSERT INTO classes (id, name, grade, students, schedule, notes, teacher_email)
       VALUES (?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         grade = excluded.grade,
         schedule = excluded.schedule,
         notes = excluded.notes,
         teacher_email = excluded.teacher_email,
         updated_at = CURRENT_TIMESTAMP`
    )
    .run(
      testClass.id,
      testClass.name,
      testClass.grade,
      testClass.schedule,
      testClass.notes,
      teacherEmail
    );
}

function ensureMembership(classId, studentEmail) {
  localDb
    .prepare(
      `INSERT INTO class_memberships (class_id, scholar_email, joined_via)
       VALUES (?, ?, 'seed')
       ON CONFLICT(class_id, scholar_email) DO NOTHING`
    )
    .run(classId, studentEmail);
}

function syncStudentCounts(classIds) {
  const countStmt = localDb.prepare('SELECT COUNT(*) as total FROM class_memberships WHERE class_id = ?');
  const updateStmt = localDb.prepare('UPDATE classes SET students = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

  for (const classId of classIds) {
    const count = countStmt.get(classId)?.total || 0;
    updateStmt.run(count, classId);
  }
}

function upsertLesson(lesson, teacherEmail) {
  const dueAt = toDueAt(lesson.dueInDays);
  const existingLesson = localDb
    .prepare(
      `SELECT id
       FROM class_lessons
       WHERE class_id = ? AND content_folder = ? AND created_by_teacher_email = ?
       LIMIT 1`
    )
    .get(lesson.classId, lesson.contentFolder, teacherEmail);

  let lessonId;
  if (existingLesson) {
    lessonId = Number(existingLesson.id);
    localDb
      .prepare(
        `UPDATE class_lessons
         SET title = ?,
             description = ?,
             due_at = ?,
             is_visible_to_students = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        lesson.title,
        lesson.description,
        dueAt,
        Number(lesson.isVisibleToStudents ? 1 : 0),
        lessonId
      );

    localDb.prepare('DELETE FROM class_lesson_steps WHERE lesson_id = ?').run(lessonId);
  } else {
    const created = localDb
      .prepare(
        `INSERT INTO class_lessons (
          class_id,
          title,
          description,
          due_at,
          content_folder,
          is_visible_to_students,
          created_by_teacher_email
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        lesson.classId,
        lesson.title,
        lesson.description,
        dueAt,
        lesson.contentFolder,
        Number(lesson.isVisibleToStudents ? 1 : 0),
        teacherEmail
      );

    lessonId = Number(created.lastInsertRowid);
  }

  const insertStep = localDb.prepare(
    `INSERT INTO class_lesson_steps (lesson_id, step_order, step_type, title, body, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (let index = 0; index < lesson.steps.length; index += 1) {
    const step = lesson.steps[index];
    insertStep.run(
      lessonId,
      index + 1,
      step.stepType,
      step.title || '',
      step.body || '',
      JSON.stringify(step.metadata || {})
    );
  }

  return lessonId;
}

async function seed() {
  await initSchemas();

  const responseTableInfo = localDb.prepare("PRAGMA table_info(class_lesson_question_responses)").all();
  const hasResponseUpdatedAtColumn = responseTableInfo.some((column) => column.name === "updated_at");
  if (!hasResponseUpdatedAtColumn) {
    localDb.exec(`ALTER TABLE class_lesson_question_responses ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;`);
  }

  // teachers
  await upsertUser({ email: TEACHER_EMAIL,   fullName: 'Test Teacher',       password: 'teacher',  role: 'teacher' });
  await upsertUser({ email: TEACHER_2_EMAIL, fullName: 'Marie Ingabire',     password: 'teacher',  role: 'teacher' });
  await upsertUser({ email: TEACHER_3_EMAIL, fullName: 'Patrick Nkurunziza', password: 'teacher',  role: 'teacher' });

  // students
  for (const student of MOCK_STUDENTS) {
    await upsertUser(student);
  }

  // classes, memberships
  for (const testClass of TEST_CLASSES) {
    upsertClass(testClass, testClass.teacherEmail);
    for (const email of testClass.studentEmails) {
      ensureMembership(testClass.id, email);
    }
  }

  // lessons
  const lessonIdByFolder = {};
  for (const lesson of MOCK_LESSONS) {
    const teacherEmail = TEST_CLASSES.find((c) => c.id === lesson.classId)?.teacherEmail || TEACHER_EMAIL;
    const id = upsertLesson(lesson, teacherEmail);
    lessonIdByFolder[lesson.contentFolder] = id;
  }

  // lesson progress
  const upsertProgress = localDb.prepare(`
    INSERT INTO class_lesson_progress
      (lesson_id, scholar_email, status, current_step, started_at, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lesson_id, scholar_email) DO UPDATE SET
      status       = excluded.status,
      current_step = excluded.current_step,
      started_at   = excluded.started_at,
      completed_at = excluded.completed_at,
      updated_at   = excluded.updated_at
  `);

  for (const p of LESSON_PROGRESS_OVERRIDES) {
    const lessonId = lessonIdByFolder[p.folder];
    if (!lessonId) continue;

    const startedAt  = daysAgoISO(p.daysAgo);
    const completedAt = p.status === 'completed' ? daysAgoISO(Math.max(0, p.daysAgo - 1)) : null;
    const updatedAt   = completedAt || startedAt;

    upsertProgress.run(lessonId, p.email, p.status, p.currentStep, startedAt, completedAt, updatedAt);
  }

  createSampleSubmissions(lessonIdByFolder);

  syncStudentCounts(TEST_CLASSES.map((item) => item.id));

  console.log('Seed complete:');
  console.log(`- Teachers: ${TEACHER_EMAIL}, ${TEACHER_2_EMAIL}, ${TEACHER_3_EMAIL}`);
  console.log(`- Required student: ${REQUIRED_STUDENT.email} / ${REQUIRED_STUDENT.password}`);
  console.log(`- Scholar accounts: ${MOCK_STUDENTS.length}`);
  console.log(`- Classes: ${TEST_CLASSES.map((c) => `${c.id} (${c.name})`).join(', ')}`);
  console.log(`- Lessons: ${MOCK_LESSONS.length}`);
  console.log(`- Progress records: ${LESSON_PROGRESS_OVERRIDES.length}`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      serverDb.close();
      localDb.close();
    } catch {
      // no-op
    }
  });
