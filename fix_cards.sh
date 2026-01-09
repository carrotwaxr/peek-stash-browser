#!/bin/bash

# Update PerformerCard.jsx
sed -i 's/, referrerUrl,/, fromPageTitle,/g' client/src/components/cards/PerformerCard.jsx
sed -i 's/referrerUrl={referrerUrl}/fromPageTitle={fromPageTitle}/g' client/src/components/cards/PerformerCard.jsx

# Update TagCard.jsx
sed -i 's/, referrerUrl,/, fromPageTitle,/g' client/src/components/cards/TagCard.jsx
sed -i 's/referrerUrl={referrerUrl}/fromPageTitle={fromPageTitle}/g' client/src/components/cards/TagCard.jsx

# Update StudioCard.jsx
sed -i 's/, referrerUrl,/, fromPageTitle,/g' client/src/components/cards/StudioCard.jsx
sed -i 's/referrerUrl={referrerUrl}/fromPageTitle={fromPageTitle}/g' client/src/components/cards/StudioCard.jsx

# Update GalleryCard.jsx
sed -i 's/, referrerUrl,/, fromPageTitle,/g' client/src/components/cards/GalleryCard.jsx
sed -i 's/referrerUrl={referrerUrl}/fromPageTitle={fromPageTitle}/g' client/src/components/cards/GalleryCard.jsx

# Update GroupCard.jsx
sed -i 's/, referrerUrl,/, fromPageTitle,/g' client/src/components/cards/GroupCard.jsx
sed -i 's/referrerUrl={referrerUrl}/fromPageTitle={fromPageTitle}/g' client/src/components/cards/GroupCard.jsx

# Update SceneCard.jsx
sed -i 's/referrerUrl="\/scenes"/fromPageTitle="\/scenes"/g' client/src/components/ui/SceneCard.jsx

echo "All replacements completed!"
