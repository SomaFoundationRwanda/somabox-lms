// Every piece of server data the app keeps has a key here. Keys are arrays that start broad and
// get narrower, so marking ["course", id] out of date covers everything kept for that course.
// lib/liveUpdates.js maps the box's change events onto these prefixes.
export const queryKeys = {
    me: ["me"],
    profile: ["me", "profile"],
    dashboard: ["me", "dashboard"],
    assignmentSummary: ["me", "assignment-summary"],
    myCalendar: ["me", "calendar"],

    notifications: ["notifications"],
    school: ["school"],
    schoolPublic: ["school", "public"],
    schoolSettings: ["school", "settings"],
    aiStatus: ["ai", "status"],

    catalogue: ["catalogue"],
    explore: ["catalogue", "explore"],
    libraryBooks: ["catalogue", "library", "books"],

    courses: ["courses"],
    myCourses: ["courses", "mine"],
    myLearners: ["courses", "mine", "learners"],
    allCourses: ["courses", "all"],
    publicCourses: (page = 1) => ["courses", "public", page],

    course: (id) => ["course", String(id)],
    courseSection: (id, path) => ["course", String(id), ...String(path).split("/").filter(Boolean)],

    users: ["users"],
    userList: (params) => ["users", "list", params],
    user: (id) => ["users", String(id)],
};
