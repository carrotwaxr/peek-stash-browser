# Custom Carousels

Create personalized homepage carousels using a visual query builder. Custom carousels let you define filter rules to automatically curate collections of scenes based on performers, tags, ratings, and more.

## Creating a Custom Carousel

1. Navigate to **Settings** → **Homepage Carousels**
2. Click **Create Carousel**
3. Configure your carousel:
   - **Title**: Give your carousel a descriptive name
   - **Icon**: Choose from a selection of icons
   - **Filter Rules**: Add one or more rules to define which scenes appear
   - **Sort**: Choose how scenes are ordered (Random, Recently Added, etc.)

4. Click **Preview** to see matching scenes
5. Click **Save** once you're satisfied with the preview

## Filter Rules

Each rule consists of a filter type, comparison operator, and value. All rules must match (AND logic) for a scene to appear in the carousel.

### Available Filters

| Filter | Description |
|--------|-------------|
| Performers | Scenes featuring specific performers |
| Tags | Scenes with specific tags |
| Studio | Scenes from a specific studio |
| Collections | Scenes in specific groups/collections |
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
| Favorite Scenes | Only your favorited scenes |
| Favorite Performers | Scenes with your favorite performers |
| Favorite Studios | Scenes from your favorite studios and their sub-studios |
| Favorite Tags | Scenes with your favorite tags, their sub-tags, or a favorite tag inherited from a performer, studio or collection |
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

The rules are the Scenes page's filters, with the same names, choices and conditions.

### Comparison Operators

Different filter types support different operators:

- **Entity filters** (Performers, Tags): Has ANY of these, Has ALL of these, Has NONE of these. Collections: In ANY of these, NOT in these.
- **Numeric filters** (Rating, Duration, etc.): a minimum, a maximum, or both
- **Resolution**: Equals, Not Equals, Greater Than, Less Than. A new Resolution rule starts at Equals, as on the Scenes page; a saved rule keeps its condition.
- **Date filters** (Created Date, Updated Date, Scene Date, Last Played Date): pick a start date, an end date, or both. A start alone matches later dates, an end alone earlier dates, and both the dates in between. Date rules are saved with the carousel and shown again when you edit it.
- **Boolean filters** (Favorites): is true
- **Text filters**: contains

## Managing Carousels

### Reordering

Use the up/down arrow buttons next to each carousel to change the display order on your homepage.

### Visibility

Click the eye icon to show/hide individual carousels. Hidden carousels remain saved but won't appear on the homepage.

### Editing

Click the pencil icon on any custom carousel to modify its rules, title, or icon. A saved rule the editor cannot show is kept as it is when you save.

### Deleting

Click the trash icon to delete a custom carousel. This action cannot be undone.

## Limits

- Maximum of **15 custom carousels** per user
- Each carousel displays up to **12 scenes**
- All filter rules use AND logic (scenes must match all rules)

## Tips

- **Start simple**: Begin with one or two rules and add more as needed
- **Use Preview**: Always preview before saving to ensure your rules work as expected
- **Random sort**: Great for variety - shows different scenes each time you visit
- **Combine with favorites**: Create carousels for "Highly rated scenes with favorite performers"
- **Content restrictions**: Custom carousels respect your hidden items and content restrictions

## Troubleshooting

### Carousel shows "No scenes found"

- Your filter rules may be too restrictive
- Try relaxing some rules or using different operators
- Check that you have scenes matching your criteria

### Carousel not appearing on homepage

- Make sure the carousel is enabled (eye icon should be visible, not crossed out)
- Try refreshing the page
- Check Settings → Homepage Carousels to verify it's toggled on
