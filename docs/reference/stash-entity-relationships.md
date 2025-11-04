# Relationships Between Stash Entities

## Scenes

- A Scene can have one Studio
- A Scene can have many Performers, Groups, and Tags

## Groups

- A Group can have one Studio
- A Group can have many Scenes and Tags
- A Group can contain other Groups

## Images

- An Image can have one Studio
- An Image can have many Performers, Galleries, and Tags

## Galleries

- A Gallery can have one Studio
- A Gallery can have many Images, Scenes, Performers, and Tags

## Studios

- A Studio can have many Scenes, Groups, Images, Galleries, and Tags
- A Studio can contain other Studios

## Performers

- A Performer can be in many Scenes, Galleries, Images, and Tags

## Tags

- A Tag can have many Scenes, Groups, Images, Performers, Galleries, and Studios
- A Tag can contain other Tags
