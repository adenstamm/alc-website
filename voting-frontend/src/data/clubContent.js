export const clubLinks = {
  instagram: "https://www.instagram.com/albumasu/",
  sunDevilCentral:
    "https://sundevilcentral.eoss.asu.edu/webapp/auth/login?redirect=%2FALC%2F&msg=LOGIN_REQUIRED",
};

export const homeActions = [
  {
    id: "vote",
    label: "Vote",
    title: "Weekly voting",
    description: "Nominate, narrow it down, and help choose what everyone listens to next.",
    kind: "route",
    target: "/vote",
  },
  {
    id: "join",
    label: "Join",
    title: "Sun Devil Central",
    description: "Join the club officially and get the real meeting details in one place.",
    kind: "external",
    target: "sunDevilCentral",
  },
];

export const specialEvents = [
  {
    id: "record-store-run",
    title: "Record store run",
    date: "2026-06-27",
    displayDate: "June 27, 2026",
    time: "2:00 PM",
    location: "Zia Records Tempe",
    status: "upcoming",
    tag: "Hangout",
    description:
      "A low-pressure crate-digging trip for anyone who wants to browse, recommend finds, and grab coffee after.",
  },
  {
    id: "summer-listening-night",
    title: "Summer listening night",
    date: "2026-06-24",
    displayDate: "June 24, 2026",
    time: "7:15 PM",
    location: "Hayden Library C8",
    status: "upcoming",
    tag: "Club night",
    description:
      "A relaxed group listen with snacks, favorite summer tracks, and a quick vote on the next theme.",
  },
  {
    id: "spring-wrap-party",
    title: "Spring wrap party",
    date: "2026-05-01",
    displayDate: "May 1, 2026",
    time: "7:00 PM",
    location: "Hayden Library C8",
    status: "recent",
    tag: "Recent",
    description:
      "Members brought favorite tracks from the semester and traded recommendations before finals week.",
  },
];

export const currentPoll = {
  id: "2026-week-16",
  phase: "nominations",
  cycleLabel: "Week 16",
  status: "Open until nominations at Wednesday's club",
  question: "What should the club listen to next?",
  description:
    "Nomination week is open. Submit one album and artist pairing for the next club session.",
  albumOfWeek: {
    title: "Heaven or Las Vegas",
    artist: "Cocteau Twins",
    note: "Current club listen",
    coverClass: "cover-week",
  },
  candidates: [],
  finalists: [],
};

export const phaseContent = {
  nominations: {
    label: "Nominations",
    title: "Submit one album for the next round",
    description:
      "This phase collects fresh album and artist nominations. Banned albums and artists are rejected before they enter the pool.",
    buttonLabel: "Lock in nomination",
  },
  primary: {
    label: "Primary Voting",
    title: "Pick one or more albums",
    description:
      "Every unique sanitized nomination is on this ballot. Choose any number from one to five; you do not need to fill all five slots.",
    buttonLabel: "Cast primary ballot",
  },
  final: {
    label: "Final IRV Voting",
    title: "Rank every finalist",
    description:
      "Order every finalist from favorite to least favorite. The admin page will show instant-runoff rounds.",
    buttonLabel: "Submit final ranking",
  },
};
