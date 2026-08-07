// The bundle entry: a no-op plugin. The bundle's value is its
// `dsh.bundle.patch` declaration (cordis.patch.yml), which the profile loader
// applies as a composition layer; the entry exists only because the bundle
// package pattern expects a resolvable main module.
export default {
  name: 'dsh-plugin-registry-bundle',
  apply() {
    // The patch layer does the mounting; nothing to register here.
  },
}
