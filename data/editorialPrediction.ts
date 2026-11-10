// The CT Strategies Editorial Board's own 2026 calls (/analysis/editorial-prediction). Hand-entered
// on election eve and frozen: the model and RCP figures are the ones the board quoted when it wrote
// the piece, not live reads, the fight-card lineups are as they stood on Nov 3, and every `text` is
// the board's wording verbatim. Margins are R-positive (R+12 = 12, D+8 = -8); `rcp: null` = no RCP
// average.

export type EditorialRace = {
  /** forecastData race id (senateData / governorData), for the model link. */
  id: string;
  /** The fight card left to right, as the ballot stood on Nov 3; `winner` = the board's pick. */
  fighters: { name: string; party: string; winner?: true }[];
  model: number;
  rcp: number | null;
  pick: number;
  text: string;
};

export const EDITORIAL_AS_OF = "November 3, 2026";

export const EDITORIAL_GENERIC_BALLOT = {
  rcp: -8.8,
  model: -7.2,
  pick: -8,
  approval: { approve: 39.1, disapprove: 59.1, net: -20 },
};

export const EDITORIAL_HOUSE = {
  dem: 234,
  rep: 201,
  demNetFlips: 20,
  text: `Not enough time to go into specific seats, will agree with model’s take on this one. 20 flips seems like a sensible result taking into account Republican redistricting wins this cycle, although the unfavorable national environment will still give Democrats a decent majority here.`,
};

// Chamber totals after the board's calls, Democrats first.
export const EDITORIAL_SENATE_COMPOSITION = { dem: 51, rep: 49 };
export const EDITORIAL_GOVERNOR_COMPOSITION = { dem: 26, rep: 24 };

export const EDITORIAL_SENATE: EditorialRace[] = [
  { id: "LA", model: 11.7, rcp: null, pick: 12,
    fighters: [{ name: "Jamie Davis", party: "D" }, { name: "Julia Letlow", party: "R", winner: true }],
    text: `It’ll be under the safe margin but it won’t narrow up the way that polls have it. Southern polls are way over their heads` },
  { id: "MT-2", model: 9.8, rcp: null, pick: 10,
    fighters: [{ name: "Alani Bankhead", party: "D" }, { name: "Seth Bodnar", party: "I" }, { name: "Kurt Alme", party: "R", winner: true }],
    text: `Dem vote will be split between Bodnar and Bankhead, so I think Alme pulls through rather comfortably although under 15.` },
  { id: "MS-2", model: 12.6, rcp: null, pick: 7,
    fighters: [{ name: "Scott Colom", party: "D" }, { name: "Cindy Hyde-Smith", party: "R", winner: true }],
    text: `Hyde-Smith has been an underperformer in both her senate runs and we will see the state tighten up again around to where she was in 2018. Colom has run a decent campaign.` },
  { id: "FL-2", model: 6, rcp: 6.3, pick: 6,
    fighters: [{ name: "Angie Nixon", party: "D" }, { name: "Ashley Moody", party: "R", winner: true }],
    text: `Florida will be closer than in 22 and 24 but it has shifted too red to be competitive even in this environment. Additionally Moody is a decent candidate while Nixon’s DSA affiliation will be an issue with Florida’s Hispanic voters` },
  { id: "NE-2", model: 4.5, rcp: 3.7, pick: 4,
    fighters: [{ name: "Dan Osborn", party: "I" }, { name: "Pete Ricketts", party: "R", winner: true }],
    text: `Dan Osborn goes for it again in a much more favorable year although against a stronger incumbent in Pete Ricketts. I think this race is narrow solely because of the national environment, but I see a comfortable Ricketts win.` },
  { id: "SC", model: 2.8, rcp: 2.6, pick: 2,
    fighters: [{ name: "Annie Andrews", party: "D" }, { name: "Darline Graham", party: "R", winner: true }],
    text: `The appointed sister of the late Lindsey Graham matches up against a surprisingly strong Annie Andrews. I think Graham wins due to party lines alone but this will be way too close for comfort and a potential warning sign for the partisan makeup of the state moving forward with all the recent people moving there. Expect Graham to have a weaker showing in the upstate area too.` },
  { id: "AK", model: 1.2, rcp: -1.0, pick: 1,
    fighters: [{ name: "Mary Peltola", party: "D" }, { name: "Dan Sullivan", party: "R", winner: true }],
    text: `This is one of the picks I am fading public consensus on. I think Peltola is decently strong but still flawed, I think people are underrating Sullivan as the incumbent, and I think that people aren’t really gonna fall for this whole fake Dan Sullivan trick that was now confirmed to have come from the Peltola campaign. Sullivan hangs on narrowly.` },
  { id: "IA", model: 0.5, rcp: 0, pick: 0.5,
    fighters: [{ name: "Josh Turek", party: "D" }, { name: "Ashley Hinson", party: "R", winner: true }],
    text: `Fundamentals point to Hinson holding on. She’s a good candidate and Iowa still is a Republican state despite the Governorship being all but lost. Turek could win off of the coattails of the Governor and house races but I think Hinson will narrowly hold off.` },
  { id: "KS", model: 0.2, rcp: -4.1, pick: 0.5,
    fighters: [{ name: "Adam Hamilton", party: "D" }, { name: "Roger Marshall", party: "R", winner: true }],
    text: `Incumbent Roger Marshall faces his first competitive election ever and he looks very unprepared to deal with it. He has been complacent and rapidly fumbling away the natural advantages he has in the state. This reminds me of 2020 Georgia, but even Perdue held on during the first round vote. I think Democrats are overhyping this race and Marshall will hold on narrowly, but another warning sign for a state quietly trending blue.` },
  { id: "TX-2", model: -1.5, rcp: -2.6, pick: -0.5,
    fighters: [{ name: "James Talarico", party: "D", winner: true }, { name: "Ken Paxton", party: "R" }],
    text: `I think it is almost certain that Paxton will outperform the polls a little due to undecided Rs reluctantly voting for Paxton, but I don’t think it will be enough to win. Fundamentals of the state favor Paxton. Talarico winning would require tremendous shifts with Hispanic and white voters, the latter being more inelastic. I do think Talarico is running a decent campaign and Paxton is weak. This reminds me of 2018, except Paxton is worse than Ted Cruz. I was very conflicted on this race, but ultimately I think the circumstances are well set for Democrats to win their first Democrat senate seat in the state since 1988. Also heavy Georgia/Arizona vibes of a red state trending blue finally flipping due to Republicans running a weak candidate.` },
  { id: "OH-2", model: -1.8, rcp: -2.8, pick: -1,
    fighters: [{ name: "Sherrod Brown", party: "D", winner: true }, { name: "Jon Husted", party: "R" }],
    text: `Another race where I think Rs will outperform polls, but the question is will it be enough to flip the outcome to hold onto the seat? Brown is a historical overperformer who only lost by 3.6 in 2024 and is running in a much more favorable year. Husted is an average candidate at worst (stronger than Moreno) in a state that went R+11 just two years ago. Can Husted hold on for the win? The two fundamental theories are clashing and the story will be which one will give in to the other. While I am very 50/50, I will give the advantage to Brown based on his past performances and a weak top of ticket in Vivek. The silver lining: Brown will have to run for reelection again in 2028.` },
  { id: "ME-2", model: -3.1, rcp: -3.6, pick: -2.5,
    fighters: [{ name: "Troy Jackson", party: "D", winner: true }, { name: "Susan Collins", party: "R" }],
    text: `Another clash of fundamentals. Collins is a strong over performer who outran Trump heavily in 2020, one of the last vestiges of a pre polarization era. Democrats had a mess with Graham Platner dropping out and Troy Jackson’s selection. Jackson might be the weakest Democrat Senate candidate this cycle, but I think polarization will finally catch up to Susan Collins this time around. Collins’s win in 2020 wasn’t as strong when you take into account the fact Democrats votes were split between a progressive Independent and Gideon, making Collins effectively win by only 3 points. That’s a much easier task for Jackson to complete even though he is a bad candidate. Maybe Collins will shock the world one last time and prove the polls and doubters wrong again. Will be exciting to watch this one.` },
  { id: "MI-2", model: -4.1, rcp: -5.3, pick: -2.5,
    fighters: [{ name: "Abdul El-Sayed", party: "D", winner: true }, { name: "Mike Rogers", party: "R" }],
    text: `Another very interesting drama filled race filled with different storylines. Abdul El-Sayed won a closely contested primary against Haley Stevens and is running to be the first Muslim elected to the US Senate as a progressive in a swing state Trump won. He has alienated traditional Democratic groups such as Jewish and Black voters, and Stevens’s last minute endorsement of Rogers adds further intrigue. Rogers is coming off a close loss in 2024 and is running an impressive campaign, making inroads with Democrats and Independents and hoping to pull up a decent upset. Unfortunately, the environment is just too blue for Rogers and the polls have been swinging heavily in favor of El-Sayed at the last second. I think the national environment will carry El-Sayed here.` },
  { id: "MN-2", model: -5.5, rcp: -5.2, pick: -5.5,
    fighters: [{ name: "Peggy Flanagan", party: "D", winner: true }, { name: "Michele Tafoya", party: "R" }],
    text: `Unexpectedly close race given the national environment. We will see if Minnesota Democrats take a hit after the fraud stuff from early this year. I don’t think Republicans have any chance in flipping this state but even a sub 10 point margin will be a curious result for the future of this state.` },
  { id: "NH", model: -8.5, rcp: -8, pick: -8,
    fighters: [{ name: "Chris Pappas", party: "D", winner: true }, { name: "John Sununu", party: "R" }],
    text: `Sununu is a strong candidate with good name recognition, Pappas is quite average, but the National environment in this blue leaning state will give Democrats a comfortable win here.` },
  { id: "GA", model: -9.1, rcp: -8.6, pick: -8,
    fighters: [{ name: "Jon Ossoff", party: "D", winner: true }, { name: "Mike Collins", party: "R" }],
    text: `The outcome of this race was never in question. Presidential hope Jon Ossoff looks to cruise to reelection.` },
  { id: "NC", model: -9.4, rcp: -11.0, pick: -9,
    fighters: [{ name: "Roy Cooper", party: "D", winner: true }, { name: "Michael Whatley", party: "R" }],
    text: `Another DOA for Republicans that they are basically surrendering. The interesting question will be which state is bluer between the two. Both are historical Republican states trending away from Republicans with strong Democrat candidates and sacrificial Republican candidates that basically aren’t even trying. Not their year.` },
];

export const EDITORIAL_GOVERNOR: EditorialRace[] = [
  { id: "NE", model: 8.7, rcp: null, pick: 14.5,
    fighters: [{ name: "Lynne Walz", party: "D" }, { name: "Jim Pillen", party: "R", winner: true }],
    text: `Not sure what the hype here is all about but the state’s governor or presidential races as of late haven’t been under 15 recently. I think we might see the state barely go under 15 this time.` },
  { id: "OK", model: 15.8, rcp: null, pick: 13,
    fighters: [{ name: "Cyndi Munson", party: "D" }, { name: "Mike Mazzei", party: "R", winner: true }],
    text: `Including Oklahoma in here as its last three governor races have all been under 15, which is kind of surprising. No reason to believe this one won’t be under 15 especially when it’s an open seat.` },
  { id: "SC", model: 10.9, rcp: 10.2, pick: 10,
    fighters: [{ name: "Jermaine Johnson", party: "D" }, { name: "Alan Wilson", party: "R", winner: true }],
    text: `South Carolina routinely votes under the safe margin (went R+11 for President in 2020 for example). Alan Wilson should win comfortably in this Republican leaning state unlike Graham whose race will be much closer.` },
  { id: "NH", model: 6.2, rcp: 6, pick: 6,
    fighters: [{ name: "Cinde Warmington", party: "D" }, { name: "Kelly Ayotte", party: "R", winner: true }],
    text: `Ayotte is a popular Republican governor in New Hampshire and will win comfortably although not by as much as in 2024.` },
  { id: "FL", model: 4.7, rcp: 4, pick: 5,
    fighters: [{ name: "David Jolly", party: "D" }, { name: "Byron Donalds", party: "R", winner: true }],
    text: `Republicans are outrunning polling in Florida. What else is new? Like the Senate race, it won’t be a total blowout but Republicans should win it somewhat comfortably although narrower.` },
  { id: "KS", model: 3.1, rcp: -0.2, pick: 3,
    fighters: [{ name: "Cindy Holscher", party: "D" }, { name: "Ty Masterson", party: "R", winner: true }],
    text: `Republicans are set to finally take the governorship back here after Laura Kelly won it twice. Kansas governor races are always close and they tend to not stick with the same party multiple times. Kansas being a true swing state on both the Governor and Senate levels is very interesting.` },
  { id: "VT", model: 12.6, rcp: null, pick: 3,
    fighters: [{ name: "Amanda Janoo", party: "D" }, { name: "Phil Scott", party: "R", winner: true }],
    text: `Sleeper interesting race of the cycle. Phil Scott had won deep blue Vermont by over 50 points two years ago and is now in the toughest fight of his political career. Polls show great variance and even my model can’t seem to figure this one out. I think it will be very narrow but ultimately Scott’s name recognition and overall reputation should have him hold on, although barely.` },
  { id: "NV", model: 1.2, rcp: -2.0, pick: 0.5,
    fighters: [{ name: "Aaron Ford", party: "D" }, { name: "Joe Lombardo", party: "R", winner: true }],
    text: `The model loves Lombardo while the consensus seems to favor Ford. I think Lombardo’s favorability along with the fact Nevada loves its incumbents will allow him to survive the blue year, but it will be close` },
  { id: "GA", model: -0.2, rcp: -0.3, pick: 0.5,
    fighters: [{ name: "Keisha Lance Bottoms", party: "D" }, { name: "Rick Jackson", party: "R", winner: true }],
    text: `I feel like the Lance Bottoms hype is purely due to the down ballot effect of Ossoff, but Rick Jackson is running a good campaign, outraising his opponent by an insane amount, and Georgia is still inherently a lean red state. Jackson holds on.` },
  { id: "OH", model: -1.9, rcp: -4.5, pick: -2,
    fighters: [{ name: "Amy Acton", party: "D", winner: true }, { name: "Vivek Ramaswamy", party: "R" }],
    text: `I said very early on in early 2025 that Vivek’s governor run wasn’t going to be as automatic as people thought. I always thought he was gonna be a rather controversial candidate and now he has fumbled away a winnable race against a weak Democrat purely on his own self inflicted mistakes. From Christmas crashouts, various aura loss moments, not capitalizing on Amy Acton’s weakness, and questionable gamble that was the ad, it seems like Amy Acton has all the momentum despite being a weak candidate herself. That plus the national environment means that I will have Acton as the favorite to win.` },
  { id: "WI", model: -4, rcp: -5.4, pick: -4,
    fighters: [{ name: "David Crowley", party: "D", winner: true }, { name: "Tom Tiffany", party: "R" }],
    text: `We were less than a half percentage point away from the most interesting governor race, but Crowley’s win locks the state up for Republicans. Sure Crowley is weak and Tiffany isn’t bad, but this race has quietly faded from prominence and will get eaten up by the national environment.` },
  { id: "IA", model: -5.3, rcp: -7.5, pick: -4.5,
    fighters: [{ name: "Rob Sand", party: "D", winner: true }, { name: "Zach Lahn", party: "R" }],
    text: `Republicans dropped the ball here. Zach Lahn pulled off one of the biggest primary upsets this cycle just to not even be competitive with the Democrat candidate. Polls have this race in blowout margins but I think Lahn will outrun them just like the primaries. Won’t be enough to win though.` },
  { id: "OR", model: -7.1, rcp: null, pick: -4.5,
    fighters: [{ name: "Tina Kotek", party: "D", winner: true }, { name: "Christine Drazan", party: "R" }],
    text: `Sneaky close race for a seat that has been decided by single digits since 2016. Kotek is unpopular but the state is too blue to elect a Republican. I see another somewhat close loss for Republicans here. Remains out of reach` },
  { id: "MI", model: -7.7, rcp: -8, pick: -6,
    fighters: [{ name: "Jocelyn Benson", party: "D", winner: true }, { name: "John James", party: "R" }],
    text: `John James might be the unluckiest recent political candidate. Runs statewide in 18 and 20 and loses both times. Then in the two red favorable years he runs for house and wins, but then on his third statewide attempt he is totally uncompetitive and once again screwed by the national environment. Benson easily wins.` },
  { id: "AZ", model: -9.4, rcp: -10.7, pick: -6.5,
    fighters: [{ name: "Katie Hobbs", party: "D", winner: true }, { name: "Andy Biggs", party: "R" }],
    text: `Arizona Republicans continue underwhelming statewide candidate streak, this time not even competitive in a rather quiet governor race here. Nothing too surprising here.` },
  { id: "AK", model: -2.5, rcp: -7.5, pick: -7,
    fighters: [{ name: "Jonathan Kreiss-Tomkins", party: "D", winner: true }, { name: "Bernadette Wilson", party: "R" }],
    text: `Speaking of quiet, feel like nobody talks about it or knows anything about this race. Republicans seemingly dropped the ball here with multiple mid candidates, Democrats had a Begich drop out to consolidate the field and are now favored to win this seat by a good amount. I’ll stick with the consensus on this one.` },
  { id: "ME", model: -11.5, rcp: -9.4, pick: -10,
    fighters: [{ name: "Hannah Pingree", party: "D", winner: true }, { name: "Robert Charles", party: "R" }],
    text: `Should be an easy win for Democrats, and we should expect to see a lot of ticket splitting between here and the senate race.` },
  { id: "MN", model: -12.6, rcp: -13.0, pick: -11,
    fighters: [{ name: "Amy Klobuchar", party: "D", winner: true }, { name: "Lisa Demuth", party: "R" }],
    text: `Klobuchar is a pretty strong candidate in a state at the center of the fraud scandal stuff. Klobuchar will win by a blowout margin, however.` },
  { id: "NM", model: -11.2, rcp: null, pick: -11,
    fighters: [{ name: "Deb Haaland", party: "D", winner: true }, { name: "Gregg Hull", party: "R" }],
    text: `Only putting this here as I think the margin will be under 15. Easy Dem win.` },
  { id: "NY", model: -14.9, rcp: -12.7, pick: -13,
    fighters: [{ name: "Kathy Hochul", party: "D", winner: true }, { name: "Bruce Blakeman", party: "R" }],
    text: `It won’t be nearly as close as 2022 but I still think Hochul is rather underwhelming and will keep New York under the safe margin.` },
];
