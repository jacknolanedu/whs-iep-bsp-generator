module.exports = {
  packagerConfig: {
    asar: true,
    name: 'WHS IEP BSP Generator',
    executableName: 'whs-iep-bsp-generator'
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
        // CI uploads to a DRAFT; a human publishing it on GitHub is the
        // go-live step (auto-update only sees published releases).
        draft: true
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
