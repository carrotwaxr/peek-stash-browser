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
| Rating | Scenes within a rating range (0-100) |
| Duration | Scene length in minutes |
| Resolution | Video quality (480p, 720p, 1080p, etc.) |
| Play Count | Number of times you've watched |
| O Count | Your O count for the scene |
| Favorite Scenes | Only your favorited scenes |
| Favorite Performers | Scenes with your favorite performers |
| Favorite Studios | Scenes from your favorite studios |
| Favorite Tags | Scenes with your favorite tags |
| Created Date | When the scene was added |
| Scene Date | The scene's release date |
| Last Played Date | When you last watched |
| Performer Age | Performer age at time of scene |
| Performer Count | Number of performers in scene |
| Bitrate | Video bitrate in Mbps |
| Title Contains | Text search in scene title |
| Details Contains | Text search in scene description |

### Comparison Operators

Different filter types support different operators:

- **Entity filters** (Performers, Tags, etc.): includes any of, includes all of, excludes
- **Numeric filters** (Rating, Duration, etc.): between, greater than, less than
- **Boolean filters** (Favorites): is true / is false
- **Text filters**: contains

## Managing Carousels

### Reordering

Use the up/down arrow buttons next to each carousel to change the display order on your homepage.

### Visibility

Click the eye icon to show/hide individual carousels. Hidden carousels remain saved but won't appear on the homepage.

### Editing

Click the pencil icon on any custom carousel to modify its rules, title, or icon.

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
