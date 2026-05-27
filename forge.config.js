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
        name: 'whs_iep_bsp_generator'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'jacknolanedu',
          name: 'whs-iep-bsp-generator'
        }
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
