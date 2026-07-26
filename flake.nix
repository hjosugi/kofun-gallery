{
  description = "Reproducible Haskell development and static-site builds for Kofun Meguri";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          haskellPackages = pkgs.haskell.packages.ghc910;
          generator = haskellPackages.callCabal2nix "kofun-gallery" self { };
          site = pkgs.stdenvNoCC.mkDerivation {
            pname = "kofun-gallery-site";
            version = "0.1.0";
            src = self;
            nativeBuildInputs = [ generator ];

            buildPhase = ''
              runHook preBuild
              rm -rf docs
              kofun-build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              cp -R docs/. "$out/"
              runHook postInstall
            '';
          };
        in
        {
          inherit generator site;
          default = generator;
        }
      );

      apps = forAllSystems (
        system:
        let
          program = "${self.packages.${system}.generator}/bin/kofun-build";
        in
        {
          default = {
            type = "app";
            inherit program;
            meta.description = "Generate the Kofun Meguri static site in docs/";
          };
          build-site = {
            type = "app";
            inherit program;
            meta.description = "Generate the Kofun Meguri static site in docs/";
          };
        }
      );

      checks = forAllSystems (system: {
        inherit (self.packages.${system}) generator site;
      });

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          haskellPackages = pkgs.haskell.packages.ghc910;
        in
        {
          default = pkgs.mkShell {
            inputsFrom = [ self.packages.${system}.generator ];
            packages = [
              haskellPackages.ghc
              haskellPackages.cabal-install
              pkgs.nodejs_22
              pkgs.imagemagick
              pkgs.python3
              pkgs.nixfmt
            ];

            shellHook = ''
              echo "Kofun Meguri development shell"
              echo "  nix run .#build-site  # generate docs/"
              echo "  node scripts/sync-data.mjs  # refresh open data"
            '';
          };
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixfmt);
    };
}
