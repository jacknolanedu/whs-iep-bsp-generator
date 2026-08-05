module.exports = {
  packagerConfig: {
    asar: true,
    name: 'WHS IEP BSP Generator',
    executableName: 'whs-iep-bsp-generator',
    // Keep working files out of the shipped app: notes, plans, and tests are
    // not part of the product, and CLAUDE.md documents known weaknesses.
    ignore: [
      /^\/(test|\.github|\.claude|\.superpowers|out)($|\/)/,
      /^\/(CLAUDE|RELEASING)\.md$/
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'whs_iep_bsp_generator',
        // Teacher-facing installer filename. Renaming the *installer* is safe;
        // the squirrel `name` above must never change or updates break.
        setupExe: 'Generate4U-Setup.exe'
      }
    },
    {
      // Kept alongside the DMG: Squirrel.Mac auto-update consumes a zip,
      // so this becomes load-bearing the day the app is code-signed.
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {}
    }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'jacknolanedu',
          name: 'whs-iep-bsp-generator'
        },
        // Tagging a version publishes the release immediately — there is no
        // draft step. Installed apps see a new version as soon as the build
        // finishes, so only tag a commit that is ready for teachers.
        draft: false
      }
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {}
    }
  ]
};
