# Custom Carousels

Create personalized homepage carousels using a visual query builder. Custom carousels let you define filter rules to automatically curate collections of scenes based on performers, tags, ratings, and more.

## Creating a Custom Carousel

1. Navigate to **Settings** → **User Preferences** → **Navigation** → **Homepage Carousels**
2. Click **Create Carousel**
3. Configure your carousel:
   - **Title**: Give your carousel a descriptive name
   - **Icon**: Choose from a selection of icons
   - **Filter Rules**: Add one or more rules, and optionally groups of rules, to define which scenes appear
   - **Sort By** and **Direction**: Choose how scenes are ordered, by any sort of the Scenes page (Random, Created At, Rating and the rest), Descending or Ascending. Playlist order needs exactly one playlist rule, and Scene Number needs a collection rule, each at the top level (not inside a group) with the top level set to Match all; without that rule the sort is not offered, and removing the rule puts the sort back to Random

4. Click **Preview** to see matching scenes
5. Click **Save** once you're satisfied with the preview. Save works only after a successful Preview, and any change to the rules or sort asks for a new one. When you edit a carousel, the button reads **Update**

## Filter Rules

Rules are edited in the same row editor as the **Advanced** view of the lists (see [Advanced Filters](browse-and-display.md#advanced-filters)). Each rule is a row with a filter, a condition and a value. The **Match** select at the top says whether a scene needs every rule (**Match all**, the default) or any one of them (**Match any**).

- The row at the end, "Add a filter...", adds a rule.
- A row's actions menu (the three dots) moves it to another group or the top level, or removes it.
- **Add group** adds a box of rules with its own Match select. Groups go one level deep.
- The same filter can be used twice, as in two Tags rows: one "has all of" and one "has any of".
- In a Match any group, rows on the same filter that each say "has any of" combine into one rule when you save, and a line under the group says so.
- A saved rule the editor has no row for shows as "A rule this editor can't show" with a **Remove** button. It stays in the carousel, as it is, until you remove it.

### Favourites of Any Kind

To show scenes you favorited in any way, whether the scene, a performer, a studio or a tag:

1. Click **Add group** and set the group to **Match any of these**.
2. In the group, add **Favorite Scenes**, **Favorite Performers**, **Favorite Studios** and **Favorite Tags**, and set each to Yes.
3. Title it, for example "Favourites of any kind", then Preview and Save.

A scene appears when it matches at least one of the four. Add rules at the top level to narrow it further, such as **Watched** set to No for the favorites you have not seen.

### Available Filters

| Filter | Description |
|--------|-------------|
| Performers | Scenes featuring specific performers |
| Tags | Scenes with specific tags |
| Performer Tags | Scenes with a performer who has the tag |
| Studios | Scenes from specific studios |
| Collections | Scenes in specific groups/collections, with sub-collections |
| Galleries | Scenes linked to specific galleries |
| Playlists | Scenes in specific playlists: your own and those shared with you |
| In any of my playlists | Scenes in one of your own playlists, or in none of them |
| Rating (0-100) | Scenes within a rating range |
| Duration (minutes) | Scene length in minutes |
| Resolution | Video quality, from 144p to 8K and Huge |
| Bitrate (Mbps) | Video bitrate in Mbps; decimals such as 2.5 are kept |
| Framerate (fps) | Frames per second |
| Orientation | Landscape, portrait or square |
| Video Codec | Text search in the video codec (h264, hevc) |
| Audio Codec | Text search in the audio codec (aac, mp3) |
| Play Count | Number of times you've watched |
| Play Duration (minutes) | How long you've watched the scene |
| O Count | Your O count for the scene |
| Favorite Scenes | Your favorited scenes, or the ones that are not |
| Favorite Performers | Scenes with your favorite performers, or with none |
| Favorite Studios | Scenes from your favorite studios and their sub-studios, or not |
| Favorite Tags | Scenes with your favorite tags, their sub-tags, or a favorite tag inherited from a performer, studio or collection; or with none |
| Organized, Has Markers, Duplicated | Yes or No |
| Watched, In Progress | Yes or No, by the [Watch History](watch-history.md) rules |
| Created Date | When the scene was added |
| Updated Date | When the scene was last changed |
| Scene Date | The scene's release date |
| Last Played Date | When you last watched |
| Performer Age | Performer age at time of scene |
| Performer Count | Number of performers in scene |
| Tag Count | Number of tags on the scene |
| Title Search | Text search in scene title |
| Details Search | Text search in scene description |
| Director Search | Text search in the scene's director |
| Path | The scene's primary file path: contains, excludes, equals or starts with |
| URL, Code | Text search in the scene's links or code |
| Captions | Scenes with captions in a language, or with none |

The rules are the Scenes page's filters, with the same names, choices and conditions.

### Comparison Operators

Different filter types support different operators:

- **Entity filters** (Performers, Tags, Studios, Galleries, Playlists): Has ANY of these, Has ALL of these, Has NONE of these. Collections: In ANY of these, NOT in these. Where the Scenes page offers them, a pick can be excluded instead of included, and **Has none** / **Has any** match scenes with no such relation at all; both are saved with the rule.
- **Numeric filters** (Rating, Duration, etc.): a minimum, a maximum, or both
- **Resolution**: Equals, Not Equals, Greater Than, Less Than. A new Resolution rule starts at Equals, as on the Scenes page; a saved rule keeps its condition.
- **Date filters** (Created Date, Updated Date, Scene Date, Last Played Date): pick a start date, an end date, or both. A start alone matches later dates, an end alone earlier dates, and both the dates in between. Date rules are saved with the carousel and shown again when you edit it.
- **Yes / No filters** (Favorites, Organized, Has Markers, Duplicated, Watched, In Progress, In any of my playlists): Yes or No
- **Text filters**: contains, and for Path also excludes, equals and starts with

## Managing Carousels

### Reordering

Use the up/down arrow buttons next to each carousel to change the display order on your homepage.

### Visibility

Click the eye icon to show/hide individual carousels. Hidden carousels remain saved but won't appear on the homepage.

### Editing

Click the pencil icon on any custom carousel to modify its rules, title, or icon. A saved rule the editor cannot show is kept as it is when you save, until you remove it. **Back** with changes you have not saved asks **Discard changes?** first.

### Deleting

Click the trash icon to delete a custom carousel. This action cannot be undone.

## Limits

- Maximum of **15 custom carousels** per user
- Each carousel displays up to **12 scenes**
- Up to **20 rules** and **5 groups** per carousel (rules that combine in a Match any group count once)
- The top level and each group are Match all (every rule) or Match any (one rule is enough)

## Tips

- **Start simple**: Begin with one or two rules and add more as needed
- **"Or" needs a group**: To mix "this or that", put those rules in a Match any group, or set the top level to Match any
- **Use Preview**: Always preview before saving to ensure your rules work as expected
- **Random sort**: Great for variety - shows different scenes each time you visit
- **Combine with favorites**: Create carousels for "Highly rated scenes with favorite performers"
- **Content restrictions**: Custom carousels respect your hidden items and content restrictions, in every group: a Match any group never shows something you hid
- **See More**: A carousel's See More opens the Scenes page with the same rules, groups included

## Troubleshooting

### Carousel shows "No scenes found"

- Your filter rules may be too restrictive
- Try relaxing some rules or using different operators
- Check that you have scenes matching your criteria

### Carousel not appearing on homepage

- Make sure the carousel is enabled (eye icon should be visible, not crossed out)
- Try refreshing the page
- Check Settings → User Preferences → Navigation → Homepage Carousels to verify it's toggled on
