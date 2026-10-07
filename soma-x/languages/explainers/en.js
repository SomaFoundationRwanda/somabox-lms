// Explainers: short, plain-language help shown next to things teachers create and pages they
// open. Each entry: title, what (what it is), when (use it when), mistake (common mistake).
// Other languages copy these keys; a missing key falls back to English (shown as such).
export default {
  ui: {
    whatIsThis: "What is this?",
    useItWhen: "Use it when",
    commonMistake: "Common mistake",
    shownInEnglish: "Not translated yet: shown in English",
    close: "Close",
    learnMore: "Learn more",
  },
  helper: {
    button: "What should I create?",
    title: "What should learners do?",
    intro: "Pick what you want learners to do. We'll open the right kind of item in the week you choose.",
    module: "Add it to",
    create: "Create it",
    cancel: "Cancel",
    goals: {
      read: { label: "Read or watch something", hint: "A page with text, pictures, or a video" },
      submit: { label: "Hand in written work or a project", hint: "An assignment you grade" },
      quiz: { label: "Answer questions that are marked automatically", hint: "A graded quiz" },
      practice: { label: "Practise without marks", hint: "A practice quiz that doesn't count" },
      discuss: { label: "Talk and share ideas with classmates", hint: "A discussion" },
      download: { label: "Download a worksheet or file", hint: "A file" },
      organise: { label: "Organise this week into parts", hint: "A sub-header" },
    },
  },
  items: {
    page: {
      title: "Page",
      what: "A page of learning material: text, pictures, links, or a video.",
      when: "Learners should read or watch something before they practise.",
      mistake: "Putting questions on a page. Questions you want answered and marked belong in a quiz or assignment.",
    },
    assignment: {
      title: "Assignment",
      what: "Work learners hand in, which you grade: an essay, a project, a worksheet, a photo of their work.",
      when: "You want to see what learners can do and give them a grade and feedback.",
      mistake: "Forgetting to tag it with an outcome. Without one it can't show learner progress, so it can't be published.",
    },
    quiz: {
      title: "Quiz",
      what: "Questions with answers the system marks for you.",
      when: "You want a quick check of understanding with instant results.",
      mistake: "Leaving questions without an outcome tag. Tag each question so you can see which outcomes learners have mastered.",
    },
    file: {
      title: "File",
      what: "A document learners can download, such as a PDF worksheet or slides.",
      when: "You already have the material as a file and learners need a copy.",
      mistake: "Uploading work you want handed back. Use an assignment for that, and attach the file to it.",
    },
    sub_header: {
      title: "Sub-header",
      what: "A label that splits a week into parts, like \"Monday\" or \"Group work\". It isn't something learners open.",
      when: "A week has many items and learners need help finding their way.",
      mistake: "Typing instructions in a sub-header. Put instructions on a page.",
    },
    discussion: {
      title: "Discussion",
      what: "A conversation where learners post and reply to each other.",
      when: "You want learners to share ideas, explain their thinking, or help each other.",
      mistake: "Asking a question with one right answer. Use a quiz for that; discussions work best with open questions.",
    },
  },
  quizKinds: {
    graded: {
      title: "Graded quiz",
      what: "Counts toward grades and outcome progress.",
      when: "You're checking what learners have learned.",
      mistake: "Allowing unlimited attempts when you want one honest try. Set the number of attempts.",
    },
    practice: {
      title: "Practice quiz",
      what: "For practice only: it doesn't count toward grades or outcome progress.",
      when: "Learners should try, get it wrong, and try again without worry.",
      mistake: "Using a practice quiz for something you need a grade for.",
    },
    baseline: {
      title: "Baseline quiz",
      what: "A short check before Week 1 that shows what each learner already knows, outcome by outcome.",
      when: "At the very start, so you can see each learner's growth later.",
      mistake: "Teaching the topic first. The baseline only works if it comes before teaching.",
    },
  },
  pages: {
    home: {
      title: "Course home",
      what: "What's happening this week, what needs your attention, and how learners are doing on each outcome.",
      when: "Start here each day.",
    },
    modules: {
      title: "Modules",
      what: "The course week by week. Each module is a week and holds everything learners do that week.",
      when: "Plan and build the course here: every item you create belongs to a week.",
      mistake: "Leaving items in \"Unassigned\". Move them into a week, or the course can't open.",
    },
    outcomes: {
      title: "Outcomes",
      what: "What learners should be able to do by the end of the course. Every graded item is linked to at least one outcome.",
      when: "Write these first, before you build the weeks.",
      mistake: "Writing outcomes that can't be checked, like \"understand fractions\". Prefer \"add fractions with different denominators\".",
    },
    baseline: {
      title: "Baseline (Week 0)",
      what: "A short, ungraded check before Week 1. Each question is tagged with an outcome, so you see where each learner starts.",
      when: "Set it up before opening the course. If you skip it, write down why.",
      mistake: "Using questions that can't be marked automatically. Baseline questions must be multiple choice with a correct answer.",
    },
    unassigned: {
      title: "Unassigned",
      what: "Items that aren't in a week yet. Learners can't see them.",
      when: "You'll see it after removing an item from a week, or after an update moved loose items here.",
      mistake: "Leaving items here. Move each one into a week; the course can't open while this has items.",
    },
    assignments: {
      title: "Assignments",
      what: "All graded work in the course: assignments, graded quizzes, and graded discussions.",
      when: "Check what's due and what still needs grading.",
      mistake: "Creating work here. Create it in the right week on the Modules page.",
    },
    quizzes: {
      title: "Quizzes",
      what: "Every quiz in the course and how learners did.",
      when: "Review quiz results or allow a learner another attempt.",
    },
    pages: {
      title: "Pages",
      what: "Every page of learning material in the course.",
      when: "Find and edit a page. To add one, go to the right week on the Modules page.",
    },
    discussions: {
      title: "Discussions",
      what: "Conversations where learners post and reply.",
      when: "Follow the conversation and answer questions.",
    },
    rubrics: {
      title: "Rubrics",
      what: "Each rubric belongs to one assignment and lists what you'll look for, with points for each part. Link each part to an outcome to see progress by outcome.",
      when: "You want fair, consistent grading and feedback learners understand.",
      mistake: "Making one huge criterion. Several small, clear criteria make grading quicker and fairer.",
    },
    grades: {
      title: "Grades",
      what: "Every learner's score on every graded item, as points and percentages.",
      when: "Check who is behind and who hasn't handed in work.",
      mistake: "Reading a blank cell as zero. A dash means nothing was handed in yet.",
    },
    insights: {
      title: "Insights",
      what: "How the class is doing, worked out from graded work and graded quizzes only. Practice activities don't count. Growth is each outcome now compared with its baseline (Week 0); normalized gain is the share of the possible improvement a learner achieved (from the baseline up to 100%).",
      when: "Find outcomes to reteach, learners who need a check-in, and items many learners missed.",
      mistake: "Reading a dash as zero. A dash means there are no results yet, and every figure says how many learners it is based on.",
    },
    calendar: {
      title: "Calendar",
      what: "When each week starts and when work opens, is due, and closes.",
      when: "Plan the term, or move an item to another day.",
      mistake: "Changing dates one by one when the whole course moved. Use Shift timeline in Settings.",
    },
    people: {
      title: "People",
      what: "Who is in the course and their role.",
      when: "Add learners or another teacher.",
    },
    announcements: {
      title: "Announcements",
      what: "Messages to everyone in the course.",
      when: "Learners need to know something soon, like a change of plan.",
    },
    syllabus: {
      title: "Syllabus",
      what: "The course plan: outcomes, grading, and the week-by-week schedule.",
      when: "Learners or parents want to see the whole course at a glance.",
    },
    files: {
      title: "Files",
      what: "Documents uploaded to the course.",
      when: "Find a file, or see where it's used.",
    },
    collaborations: {
      title: "Collaborations",
      what: "Links to shared work spaces, like a shared document.",
      when: "Learners work together outside the course.",
    },
    settings: {
      title: "Settings",
      what: "Course details, dates, the menu learners see, and course setup.",
      when: "Set the start date, move the whole timeline, or finish setup.",
    },
    setup: {
      title: "Course setup",
      what: "Everything that must be done before the course can open, and what's worth checking.",
      when: "Before opening the course. Required steps must be done; warnings are advice.",
    },
    shiftTimeline: {
      title: "Shift timeline",
      what: "Moves dates by a number of days: the whole course, or one week and everything after it.",
      when: "School started late, or a week was lost.",
      mistake: "Applying without looking. Preview first to see every date that will change.",
    },
  },
};
