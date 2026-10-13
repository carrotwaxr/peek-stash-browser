# Recommendations

Get personalized scene suggestions based on your favorites, ratings and what you watch.

## How It Works

Peek learns your taste from what you do, then scores every scene you can see and lists the best 500 on the **Recommended** page. It also uses your taste to order **Scenes Like This** on a scene's page. You can tune it under [Recommendation settings](#recommendation-settings).

### What counts

- **Favorites and ratings** of performers, studios and tags. A high rating counts for, and a low rating counts against: below 5.0 pushes a performer, studio or tag down, and a scene with one scores lower.
- **Scenes you rate or favorite.** Their performers, studio and tags gain (or lose, for a low rating). A favorited scene with no rating counts as a good one.
- **What you watch, and how much.** Os count the most, then time watched, then plays. You do not need to rate or favorite anything for this to work.
- **Scenes you open and leave quickly.** A scene you leave within two minutes, with no play and no O, counts a little against its performers, studios and tags. It never counts against someone you have had an O with.
- **Recent viewing counts more.** What you watched in the last three months weighs the most, and viewing from years ago weighs a quarter as much.

### Performers with few scenes

A performer you watched once is not assumed to be a top favorite. Peek weighs a performer's viewing against how many scenes they have and against your average, so it takes repeated engagement to rank a performer high. The same goes for studios and tags.

### Tags

- **Rare tags say more about your taste than common ones.** A tag on most of the library tells Peek little. A tag on a few scenes tells it a lot.
- **Favorites reach down.** A favorite tag also lifts its sub-tags, and a favorite studio lifts its sub-studios, a little less for each step down. A sub-tag you rate or watch yourself uses its own score.
- **Inherited tags count too.** Tags a scene gets from its performers or its studio count, a bit less than tags on the scene itself.
- **Ignored tags count for nothing.** See [Recommendation settings](#recommendation-settings).

### Scenes you already watched

- A scene you watched today is left out.
- Scenes you watched recently sit lower. The longer ago, the less they are held back.
- Scenes you opened and abandoned sit lower too.
- Scenes you have not seen are not held back at all. Your **Recommend** setting changes how strongly these rules apply.

### Variety

No single performer or studio fills the list. Each time a performer or studio is picked, more scenes with them score a little less, so the top 500 mixes them.

The more you rate, favorite and watch, the better your recommendations become!

## Accessing Recommendations

### Recommended Page

Click **Recommended** in the navigation menu to see your top 500 scenes, best matches first. It works like the other lists (see [Browse and Display](browse-and-display.md)):

- **Grid, Wall and Table** views, with the same density and zoom controls (there is no Timeline or Folder view here)
- **Page size** above and below the scenes, and pagination for browsing more results
- A **search box**, the **filter bar** with its chips, **+ Filter**, **Advanced** and your pins, and **Views**
- **Sorts**: every scene sort, with **Recommended** (the rank) first and chosen to start with

The list stays the same while you page through it, so a scene never appears on two pages. It is scored again when your ratings, favorites, plays, hidden items or [recommendation settings](#recommendation-settings) change, when the library syncs, and each new day. The top 500 is picked for variety, and nearby scenes trade places once a day. Hidden and restricted scenes are never listed or counted, and every page is full.

#### Filters, Search and Views on Recommended

Filters and search work **within your top 500 recommendations**. The page lists your best 500 scenes; a filter or a search narrows that list, it does not look through the rest of your library. While a filter or a search is on, the page says so ("Filtering within your top 500 recommendations"), and the total is how many of the 500 match. A filter that matches none of them says "No recommendations match these filters". Finding the matches beyond the 500 is not there yet: use the [Scenes](browse-and-display.md#filters) page for that.

Recommended has its own **Views** and its own default View, apart from the Scenes page: save the filters, the sort (including Recommended), the view mode, the density and the page size you like here as a View, and set it as the default for the **Recommended page** to open the page that way. Pins are the ones you keep for Scenes. On a phone, **Filters** opens the filter sheet, and its **Show N results** button counts the matches within your top 500.

### Recommended Sidebar

When viewing a scene, the sidebar shows related recommendations:

- Similar performers
- Same studio
- Matching tags

### Similar Scenes

The scene page's **Similar Scenes** tab (and the sidebar, which shows its first page) lists scenes that share the scene's performers, studio or tags, the closest matches first. Only scenes from the same server as the scene you are viewing are listed, and never a scene you can't see: hidden and restricted scenes are left out of the list and its count.

How it ranks:

- A shared **performer** counts the most. A shared **studio** counts next, and shared **tags** add to it.
- **Rare tags weigh more.** A tag on a few scenes counts for more than a tag on most of the library.
- **Partners count half.** If you chose partners under [Recommendation settings](#recommendation-settings), a shared partner counts half as much as a shared performer you follow.
- **Ignored tags count nothing.**
- **Scenes you just watched sit lower.** A scene you watched in the last two weeks drops further than one you watched earlier. Scenes you only opened still show in full.

## Building Your Profile

### Getting Started

If you're new to Peek, you'll see a message explaining how to get recommendations:

1. **Favorite performers** you enjoy
2. **Rate scenes** you watch (the higher the rating, the more it counts)
3. **Favorite studios** that consistently produce content you like
4. **Favorite tags** for your preferred categories

### Activity Indicators

When the Recommended page has nothing to list, it shows your current activity so you can see what to build on:

```
Your current activity:
• 5 favorited performers, 3 highly-rated
• 2 favorited studios, 1 highly-rated
• 8 favorited tags, 4 highly-rated
• 15 favorited scenes, 42 rated scenes
• 12 performers, studios and tags from your viewing
```

This helps you understand what's driving your recommendations. A page that is empty only because of a filter or a search says "No recommendations match these filters" instead; clear the filter to see the list again.

## Tips for Better Recommendations

### Rate Generously

Rate scenes you watch, even if just quickly:

Ratings run from 0 to 10.

- **Above 5.0** = Scenes like this are recommended more, and the higher the rating the more it counts
- **Below 5.0** = Scenes like this are recommended less, and the lower the rating the more it counts against
- **5.0** = Neutral
- A favorited scene with no rating counts as a good one
- A performer, studio or tag you rate counts the same way: high lifts it, low sinks it

### Favorite Strategically

Favorites have strong weight in recommendations:

- Favorite your **top performers** (not just ones you like)
- Favorite **studios** whose content you consistently enjoy
- Favorite **tags** for categories you always want to see

### Explore Hidden Gems

Recommendations can surface scenes you might have missed:

- Older content from favorite performers
- Other scenes from studios you've rated highly
- Scenes with multiple matching tags

## How Recommendations Are Scored

Every performer, studio and tag gets a score for you, from strongly liked to strongly disliked. It comes from your favorites and ratings, the scenes you rated, and what you watch. Then each scene is scored from its parts:

| Part of the scene | How much it counts |
|-------------------|--------------------|
| Performers you follow | Most |
| Your own rating of the scene | High |
| Studio | Medium |
| Tags (the five best count) | Medium |
| Partners | Raise or lower the whole score |

Then how you watched the scene changes its score: a scene you watched today drops out, and recent or abandoned scenes sit lower.

- **More favorite performers help, with diminishing returns.** A scene with four favorite performers scores higher than one with a single favorite, but not four times higher.
- **Dislikes count.** A performer, studio or tag you rate low pulls a scene down.
- **Your own rating of a scene counts.** A scene you rated high scores higher, and one you rated low scores lower.
- **Rare tags beat common ones**, and tags a scene gets from its performers or studio count a bit less than its own.

## Recommendation settings

**Location:** Settings > Customization > Recommendations

Five settings tune Recommended and Scenes Like This. My Stats follows your performer choices and ignored tags too. They are for you alone, and a change takes effect right away.

| Setting | What it does |
|---------|--------------|
| **Performers I follow** | The genders you want scenes about. Leave all unticked to treat every performer alike. |
| **Partners who matter** | Genders whose presence makes a scene better or worse for you, rather than counting as someone you follow. Needs at least one gender under Performers I follow. |
| **Scenes without a partner** | **Show normally**, or **Show less often, unless every performer is a favorite**. Needs at least one partner gender. |
| **Recommend** | **Mostly new scenes**, **A balance** or **Favorites again**. |
| **Tags that aren't about taste** | Tags to ignore. Pick technical or bookkeeping tags, such as resolution or upscaled tags. |

### Example: the partner makes or breaks the scene

If you follow female performers but the male partner makes or breaks a scene for you, tick **Female** under **Performers I follow** and **Male** under **Partners who matter**. A partner you like lifts a scene, one you dislike sinks it, and several partners count as their average, not their number. Set **Scenes without a partner** to **Show less often**, and girl/girl scenes drop down unless every performer is a favorite.

### Recommend

- **Mostly new scenes** holds back scenes you have watched the most. Scenes you have not seen lead.
- **A balance** (the default) holds back scenes you watched recently, and lets older favorites come back as time passes.
- **Favorites again** brings scenes you have watched and enjoyed back sooner, and gives scenes with many Os a lift. Unseen scenes are held back a little.

In every mode, a scene you watched today is left out.

### Tags that aren't about taste

Some tags describe the file, not the scene. Add tags like a resolution tag or an upscaled tag here, and Peek ignores them. They do not lift or sink a scene in Recommended, they carry no weight in Scenes Like This, and they are left out of Top Tags on [My Stats](stats.md).

## Excluding Scenes

Already seen a recommendation? Don't want to see it again?

1. Click the **Hide** button on the scene card
2. The scene won't appear in recommendations again
3. Hidden scenes can be restored from **Settings** > **User Preferences** > **Content** > **Hidden Items**

## Recommendations vs. Random

| Feature | Recommendations | Random Sort |
|---------|-----------------|-------------|
| Personalized | Yes | No |
| Based on ratings | Yes | No |
| Surfaces old content | Yes | Yes |
| Repeatable | Mostly (the same preferences give the same scores; nearby scenes trade places once a day) | No (different each session) |

Use **Recommendations** when you want curated content. Use **Random** when you want to discover without preferences.

## Troubleshooting

### "No Recommendations Yet"

This appears when you haven't rated, favorited or watched enough content (watching alone is enough once Peek has ranked what you watch most, which takes a little while after you start):

1. Browse scenes and rate some above 5.0
2. Favorite a few performers you enjoy
3. Return to Recommendations

### A filter or search finds fewer scenes than the library holds

Recommended filters and searches within your top 500 recommendations, not the whole library, and says so while one is on. A scene that is not among your 500 best matches is not found here. Use the [Scenes](browse-and-display.md#filters) page to filter the whole library; finding matches beyond the 500 on Recommended is not there yet.

### Recommendations seem repetitive

If you're seeing the same scenes:

1. Set **Recommend** to **Mostly new scenes** under [Recommendation settings](#recommendation-settings)
2. Hide scenes you've already watched
3. Rate more scenes to expand your profile
4. Favorite more diverse performers/tags

### Recommendations don't match my taste

Your recommendation profile might need tuning:

1. Review your favorites (click the heart on an item's card or page to remove any accidental favorite)
2. Rate more scenes to give the algorithm more data
3. Rate scenes you dislike low. Ratings below 5.0 push similar scenes down
4. Check your [Recommendation settings](#recommendation-settings): the performers you follow, your partners and your ignored tags

## Next Steps

- [Custom Carousels](custom-carousels.md) - Create your own homepage carousels
- [Watch History](watch-history.md) - Track what you've watched
- [Playlists](playlists.md) - Manually curate scene collections
