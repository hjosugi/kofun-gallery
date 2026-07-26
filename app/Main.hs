{-# LANGUAGE OverloadedStrings #-}

module Main (main) where

import Control.Monad (forM_, unless)
import Data.Aeson (FromJSON (..), eitherDecode, withObject, (.:))
import qualified Data.ByteString.Lazy as BL
import qualified Data.Text as T
import qualified Data.Text.IO as TIO
import System.Directory
  ( copyFile
  , createDirectoryIfMissing
  , doesDirectoryExist
  , listDirectory
  )
import System.FilePath ((</>))

data Kofun = Kofun
  { hasImage :: Bool
  , isPanorama :: Bool
  }

instance FromJSON Kofun where
  parseJSON = withObject "Kofun" $ \o ->
    Kofun
      <$> o .: "hasImage"
      <*> o .: "isPanorama"

main :: IO ()
main = do
  rawData <- BL.readFile "data/kofun.json"
  records <-
    either
      (fail . ("Could not decode data/kofun.json: " <>))
      pure
      (eitherDecode rawData :: Either String [Kofun])

  template <- TIO.readFile "site-src/index.html"
  let countText = tshow (length records)
      imageText = tshow (length (filter hasImage records))
      panoramaText = tshow (length (filter isPanorama records))
      rendered =
        T.replace "{{KOFUN_COUNT}}" countText
          . T.replace "{{IMAGE_COUNT}}" imageText
          . T.replace "{{PANORAMA_COUNT}}" panoramaText
          $ template

  createDirectoryIfMissing True "docs/assets"
  TIO.writeFile "docs/index.html" rendered
  TIO.writeFile "docs/404.html" rendered
  BL.writeFile "docs/assets/kofun-data.js" $
    BL.concat ["window.KOFUN_DATA=", rawData, ";\n"]
  copyDirectory "site-src/assets" "docs/assets"
  copyFile "site-src/robots.txt" "docs/robots.txt"
  copyFile "site-src/manifest.webmanifest" "docs/manifest.webmanifest"
  TIO.writeFile "docs/.nojekyll" ""
  TIO.writeFile "docs/sitemap.xml" sitemap

  putStrLn $
    "Generated docs/: "
      <> show (length records)
      <> " kofun, "
      <> show (length (filter hasImage records))
      <> " with images, "
      <> show (length (filter isPanorama records))
      <> " panoramas."

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
    , "</urlset>"
    ]
