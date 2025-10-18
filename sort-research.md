## Filters for Scenes

- date, created_at, last_played_at, updated_at
  - Date format: YYYY-MM-DD HH:MM
  - Modifiers: GREATER_THAN, LESS_THAN, BETWEEN, NOT_BETWEEN
- duration, play_duration
  - Duration format: hh:mm:ss.ms
  - Modifiers: GREATER_THAN, LESS_THAN, BETWEEN, NOT_BETWEEN
- audio_codec, details, director, title
  - Use Modifier INCLUDES and do a text search for value
- favorite, organized, performer_favorite
  - true/false, does not use {modifier, value} object pattern like other fields
- bitrate, framerate, play_count, o_counter, rating100, performer_age, performer_count, tag_count
  - value is a number
  - Modifiers: EQUALS, GREATER_THAN, LESS_THAN
- resolution
  - allowed values: 360p,480p,540p,720p,1080p,1440p,4k
  - Modifier: EQUALS, GREATER_THAN, LESS_THAN
- performers, tags, studios
  - Modifier: INCLUDES
  - Example addition to scene_filter: "tags":{"value":["328"],"excludes":[],"modifier":"INCLUDES_ALL","depth":0}
  - To populate dropdown we would need to query all tags, studios, and performers and provide a searchable select dropdown

## Sort Columns for Scenes

    bitrate
    created_at
    date
    duration
    filesize
    framerate
    last_o_at
    last_played_at
    path
    performer_count
    play_count
    play_duration
    random
    rating
    tag_count
    title
    updated_at

## Filters for Studios

- created_at, updated_at
  - Date format: YYYY-MM-DD HH:MM
  - Modifiers: GREATER_THAN, LESS_THAN, BETWEEN, NOT_BETWEEN
- details, name
  - Use Modifier INCLUDES and do a text search for value
- favorite
  - true/false, does not use {modifier, value} object pattern like other fields
- rating100, scene_count
  - value is a number (rating100 is bound 0-100)
  - Modifiers: EQUALS, GREATER_THAN, LESS_THAN

## Sort Columns for Studios

    created_at
    name
    random
    rating
    scenes_count
    updated_at

## Filters for Tags

- created_at, updated_at
  - Date format: YYYY-MM-DD HH:MM
  - Modifiers: GREATER_THAN, LESS_THAN, BETWEEN, NOT_BETWEEN
- description, name
  - Use Modifier INCLUDES and do a text search for value
- favorite
  - true/false, does not use {modifier, value} object pattern like other fields
- scene_count
  - value is a number
  - Modifiers: EQUALS, GREATER_THAN, LESS_THAN

## Sort Columns for Tags

    created_at
    name
    random
    scenes_count
    updated_at

## Filters for Performers

- birthdate, death_date, created_at, updated_at
  - Date format: YYYY-MM-DD HH:MM
  - Modifiers: GREATER_THAN, LESS_THAN, BETWEEN, NOT_BETWEEN
- details, name, ethnicity, eye_color, fake_tits, hair_color, measurements, piercings, tattoos
  - Use Modifier INCLUDES and do a text search for value
- favorite
  - true/false, does not use {modifier, value} object pattern like other fields
- age, birth_year, career_length, death_year, height_cm, penis_length, o_counter, play_count, rating100, scene_count, weight
  - value is a number
  - Modifiers: EQUALS, GREATER_THAN, LESS_THAN
- gender
  - allowed values: MALE or FEMALE
  - Modifier: EQUALS

## Sort Columns for Performers

    birthdate
    career_length
    created_at
    height
    last_o_at
    last_played_at
    measurements
    name
    o_counter
    penis_length
    play_count
    random
    rating
    scenes_count
    updated_at
    weight
