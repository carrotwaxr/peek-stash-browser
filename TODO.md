# Bugs

- Player says HEVC is not supported on my client but it is. I think there may be a bug with how we're matching / detecting MIME types
  - "Playback Method: Video codec 'hevc' not supported"
  - Trying to play the file also produces this backend error: TypeError: path must be absolute or specify root to res.sendFile
  - h264 videos play just fine with no errors
- VideoPlayer page doesn't have the full navigation menu / header. It only has Home and Scenes when it should have Home, Scenes, Performers, Studios, Tags, and the theme switcher like every other page

# Backend Upgrades

- Our Docker setup and backend have a Postgres databsae and Prisma, but they're not actually being used for anything yet. If there are any leftover models, we can remove them and start fresh. Let's begin using it, and have support for database migrations so that future changes we make are easy to deploy and easy for consuming of this package to upgrade versions.
  - Stash, which is what our app's backend talks to, is a separate app who's primary purpose is as a database and metadata manager for video libraries. As such, it's already storing and managing most of the data we need and exposes a GraphQL API that we're interacting with. So we don't need to store too much information ourselves, only enough to extend what Stash offers and support the features of our browser / player app for Stash.
  - Let's start with introducing Users. Eventually we will add support for multiple user roles (Admin, non-Admin) and the ability for Admins to manage users. New setups should include a seeded admin user with the username/password of admin/admin. Simple username/password authentication will suffice for this app. Eventually we will also track user's watch history, allow them to create playlists, and custom themes.
- Once the Users table has been added to the database, let's also add authentication to our app so that users hit a Login page if they're not authenticated, and cannot interact with the backend or view any pages on the frontend without logging in first. Choose a technology / package for this that is popular and well-maintained.
- We will eventually want to add support for updating Scenes, Studios, Performers, and Tags which should all be supported methods in stashapp-api. Can we update our backend API to support this? We will integrate the frontend with these capabilites later
- For Performers, Studios, and Tags we only ever care about ones with Scenes associated to them, so we can just apply a scene_count GREATER_THAN 0 on the backend when we query those things

# UI / Frontend Upgrades

- Eventually we will add images associated with Performers, Studios, and Tags, so we should add a place for these on their Details pages. Additionally, for the Scene cards, we'll want a small version of the Performer image to appear in the Tooltip that appears when you hover over the Performers in the card.
- Let's move the Studio into the thumbnail overlay in the top right of the thumbnail.
- Let's change the Performers and Tags information on a card to just be the icons (centered) and show the additonal information in the Tooltip
- Let's move Date directly under Title
- At the bottom of the card where Filesize is, place Resolution there where Studio used to be. This may or may not be an actual field. If it's not, we'll have to calculate it from the video's height and width.
- On the Scenes, Performers, Studios, and Tags pages, let's add the pagination controls both above and below the returned data. Then at the top, let's also add Filters. We already have the search field which works perfectly and I believe gets passed to the "q" variable on the backend, but I also want Sorting and Filtering controls. The Stash GraphQL server and thus our backend support sorting and filtering in conjunction with the pagination

  - Sorting: Scenes
    - Should be able to sort by: Bit Rate, Created At, Date, Duration, File Size, Frame Rate, Last O At, Last Played At, O Count, Performer Count, Play Count, Play Duration, Random, Rating, Tag Count, Title, and Updated At
  - Sorting: Performers
    - Should be able to sort by: Birthdate, Created At, Height, Name, O Count, Penis Length, Play Count, Random, Rating, Scene Count, Updated At, and Weight
  - Sorting: Tags
    - Should be able to sort by: Created At, Name, Random, Scene Count, and Updated At
  - Sorting: Studios

    - Should be able to sort by: Created At, Name, Random, Rating, Scene Count, and Updated At

  - Filtering: Scenes
    - Should be able to filter on: Date, Details, Duration, Frame Rate, O Count, Organized, Performer Count, Performer Favorited, Play Count, Play Duration, Rating, Resolution, Studio, Tags, Tag Count, Title, Created At, and Updated At
  - Filtering: Performers
    - Should be able to filter on: Age, Birthdate, Death Date, Details, Ethnicity, Eye Color, Fake Tits, Favorite, Gender, Hair Color, Height, O Count, Penis Length, Scene Count, Weight, Created At, and Updated At
  - Filtering: Tags
    - Should be able to filter on: Favorite, Scene Count, Created At, and Updated At
  - Filtering: Studios
    - Should be able to filter on: Favorite, Rating, Scene Count, Created At, and Updated At

- Circling back to the various list/grid and Details pages, let's make some minor UX improvements here.
  - Tags (list/grid page) - for each item card, they're actually nearly perfect as is but I want to make sure that the avatar portion of it can be swapped out with a real image once we have those. Additionally let's make the image avatar not rounded and instead be rectangular as most of these images will be landscape orientation. Also, the items are 1 item per row on my screen and they should follow a similar responsive layout to that of the SceneGrid except here the maximum should be 3 columns.
  - Tag Details page - The title is used twice which is redundant. Let's leave the Header one and replace the hashtag chip with a large version of the image associated with the tag, if we have one. Here, as should be the case everywhere the SceneGrid appears, pagination controls and our new sorting and filtering should be present.
  - Studios (list/grid page) - for each item card, the Title/Name is used twice. The left portion should be an image avatar just like we're doing for Tags. Also, they are 1 item per row on my screen and they should follow a similar responsive layout to that of the SceneGrid except here the maximum should be 3 columns.
  - Studio Details page - Missing the title? Instead it renders the ID. Let's also display whatever other information we have on the Studio before the SceneGrid
  - Performers (list/grid page) - Looks good but we'll want large images on these. In fact, we'll want them to look more like the Scene cards except geared more for Actors/Performers and the information we have about them. The layout should go up to 6 columns like SceneGrid as well.
  - Performer Details page - We're not using the horizontal space for their stats properly. We should use CSS Grid or Flexbox to make a better layout, and display all of the information we have on the Performer as well as a large, portrait oriented photo
