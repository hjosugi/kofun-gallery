{-# LANGUAGE OverloadedStrings #-}

module Main (main) where

import Control.Monad (forM_, unless)
import Data.Aeson (FromJSON (..), eitherDecode, withObject, (.:))
import qualified Data.ByteString as BS
import qualified Data.ByteString.Lazy as BL
import Data.List (group, sort)
import qualified Data.Text as T
import qualified Data.Text.Encoding as TE
import System.Directory
  ( copyFile
  , createDirectoryIfMissing
  , doesDirectoryExist
  , listDirectory
  )
import System.FilePath ((</>))

data Kofun = Kofun
  { kofunId :: T.Text
  , kofunName :: T.Text
  , latitude :: Double
  , longitude :: Double
  , hasImage :: Bool
  , isPanorama :: Bool
  }

instance FromJSON Kofun where
  parseJSON = withObject "Kofun" $ \o ->
    Kofun
      <$> o .: "id"
      <*> o .: "name"
      <*> o .: "lat"
      <*> o .: "lng"
      <*> o .: "hasImage"
      <*> o .: "isPanorama"

main :: IO ()
main = do
  rawData <- BL.readFile "data/kofun.json"
  records <-
    either
      (fail . ("Could not decode data/kofun.json: " <>))
      pure
      (eitherDecode rawData :: Either String [Kofun])

  either fail pure (validateRecords records)

  indexTemplate <- readUtf8File "site-src/index.html"
  developerTemplate <- readUtf8File "site-src/developers.html"
  let renderedIndex = renderTemplate records indexTemplate
      renderedDevelopers = renderTemplate records developerTemplate

  createDirectoryIfMissing True "docs/assets"
  writeUtf8File "docs/index.html" renderedIndex
  writeUtf8File "docs/404.html" renderedIndex
  writeUtf8File "docs/developers.html" renderedDevelopers
  BL.writeFile "docs/assets/kofun-data.js" $
    BL.concat ["window.KOFUN_DATA=", rawData, ";\n"]
  copyDirectory "site-src/assets" "docs/assets"
  copyFile "site-src/robots.txt" "docs/robots.txt"
  copyFile "site-src/manifest.webmanifest" "docs/manifest.webmanifest"
  writeUtf8File "docs/.nojekyll" ""
  writeUtf8File "docs/sitemap.xml" sitemap

  putStrLn $
    "Generated docs/: "
      <> show (length records)
      <> " kofun, "
      <> show (length (filter hasImage records))
      <> " with images, "
      <> show (length (filter isPanorama records))
      <> " panoramas."

renderTemplate :: [Kofun] -> T.Text -> T.Text
renderTemplate records =
  T.replace "{{KOFUN_COUNT}}" (tshow (length records))
    . T.replace "{{IMAGE_COUNT}}" (tshow (length (filter hasImage records)))
    . T.replace "{{PANORAMA_COUNT}}" (tshow (length (filter isPanorama records)))

validateRecords :: [Kofun] -> Either String ()
validateRecords records
  | null records = Left "data/kofun.json must contain at least one record"
  | not (null emptyRequired) =
      Left ("Records have an empty id or name: " <> summarize emptyRequired)
  | not (null duplicateIds) =
      Left ("Duplicate record ids: " <> summarize duplicateIds)
  | not (null invalidCoordinates) =
      Left ("Coordinates outside WGS84 bounds: " <> summarize invalidCoordinates)
  | not (null invalidPanoramas) =
      Left ("Panorama records must also have an image: " <> summarize invalidPanoramas)
  | otherwise = Right ()
 where
  emptyRequired =
    [ kofunId record
    | record <- records
    , T.null (T.strip (kofunId record)) || T.null (T.strip (kofunName record))
    ]
  duplicateIds =
    [identifier | identifier : _ : _ <- group (sort (map kofunId records))]
  invalidCoordinates =
    [ kofunId record
    | record <- records
    , latitude record < -90
        || latitude record > 90
        || longitude record < -180
        || longitude record > 180
    ]
  invalidPanoramas =
    [kofunId record | record <- records, isPanorama record && not (hasImage record)]

summarize :: [T.Text] -> String
summarize values =
  T.unpack (T.intercalate ", " (take 8 values))
    <> if length values > 8 then " …" else ""

readUtf8File :: FilePath -> IO T.Text
readUtf8File path = do
  bytes <- BS.readFile path
  either
    (fail . (("Invalid UTF-8 in " <> path <> ": ") <>) . show)
    pure
    (TE.decodeUtf8' bytes)

writeUtf8File :: FilePath -> T.Text -> IO ()
writeUtf8File path = BS.writeFile path . TE.encodeUtf8

copyDirectory :: FilePath -> FilePath -> IO ()
copyDirectory source destination = do
  exists <- doesDirectoryExist source
  unless exists $ fail ("Missing directory: " <> source)
  createDirectoryIfMissing True destination
  entries <- listDirectory source
  forM_ entries $ \entry -> do
    let from = source </> entry
        to = destination </> entry
    isDirectory <- doesDirectoryExist from
    if isDirectory
      then copyDirectory from to
      else copyFile from to

tshow :: Show a => a -> T.Text
tshow = T.pack . show

sitemap :: T.Text
sitemap =
  T.unlines
    [ "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
    , "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">"
    , "  <url><loc>https://hjosugi.github.io/kofun-photo/</loc></url>"
    , "  <url><loc>https://hjosugi.github.io/kofun-photo/developers.html</loc></url>"
    , "</urlset>"
    ]
