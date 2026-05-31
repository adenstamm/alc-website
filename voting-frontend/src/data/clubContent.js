export const recentAlbums = [
  {
    id: "blonde",
    title: "Blonde",
    artist: "Frank Ocean",
    period: "Recently featured",
    coverClass: "cover-blonde",
    note: "A dense, emotional listen that turned into the longest post-club discussion of the month.",
  },
  {
    id: "currents",
    title: "Currents",
    artist: "Tame Impala",
    period: "Two weeks ago",
    coverClass: "cover-currents",
    note: "A polished psych-pop pick that gave the club a lighter, more immediate week.",
  },
  {
    id: "discovery",
    title: "Discovery",
    artist: "Daft Punk",
    period: "Three weeks ago",
    coverClass: "cover-discovery",
    note: "A high-energy choice that let newer members jump in without needing much context.",
  },
  {
    id: "ctrl",
    title: "Ctrl",
    artist: "SZA",
    period: "Last month",
    coverClass: "cover-ctrl",
    note: "A lyrical album that pulled conversation toward songwriting and sequencing.",
  },
  {
    id: "vespertine",
    title: "Vespertine",
    artist: "Björk",
    period: "Archive pick",
    coverClass: "cover-vespertine",
    note: "An intimate album that pulled the room toward texture, production, and close listening.",
  },
];

export const clubLinks = {
  discord: "#",
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
  {
    id: "discord",
    label: "Discord",
    title: "Community chat",
    description: "The place for reminders, side conversations, and keeping up between meetings.",
    kind: "external",
    target: "discord",
  },
  {
    id: "events",
    label: "Events",
    title: "Special events",
    description: "Live concerts, volunteering, and occasional hangs beyond the weekly meeting.",
    kind: "route",
    target: "/events",
  },
];

export const instagramFeed = [
  { id: "post-1", label: "Meeting recap", coverClass: "feed-meeting" },
  { id: "post-2", label: "Album of the week", coverClass: "feed-album" },
  { id: "post-3", label: "Group listen", coverClass: "feed-listen" },
  { id: "post-4", label: "Event post", coverClass: "feed-event" },
  { id: "post-5", label: "Archive pick", coverClass: "feed-archive" },
  { id: "post-6", label: "Club moment", coverClass: "feed-club" },
];

export const specialEvents = [
  {
    id: "record-store-run",
    title: "Record store run",
    date: "2026-06-06",
    displayDate: "June 6, 2026",
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
    date: "2026-06-18",
    displayDate: "June 18, 2026",
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

export const weeklyRhythm = [
  {
    step: "01",
    title: "Listen with intention",
    description:
      "The home page keeps the current album visible so members always know what the club is sitting with this week.",
  },
  {
    step: "02",
    title: "Open one clear ballot",
    description:
      "Voting lives on a dedicated page, which keeps the primary action obvious instead of hiding it inside a noisy feed.",
  },
  {
    step: "03",
    title: "Reset the cycle cleanly",
    description:
      "A new poll id creates a fresh ballot, so every week starts from a clean state without touching old results.",
  },
];

export const clubPrinciples = [
  {
    title: "Editorial, not chaotic",
    description:
      "The site is built to feel curated. Every section exists to reinforce the club rhythm instead of filling space.",
  },
  {
    title: "One ballot per phase",
    description:
      "Votes are enforced in the database so each approved member gets one submission per phase.",
  },
  {
    title: "Admin-run phases",
    description:
      "Admins move the poll from nominations to primary to final without redeploying the site.",
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
    title: "Rank all five finalists",
    description:
      "Order the five finalists from favorite to least favorite. The admin page will show instant-runoff rounds.",
    buttonLabel: "Submit final ranking",
  },
};
