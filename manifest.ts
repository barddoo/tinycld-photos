const manifest = {
    name: 'Photos',
    slug: 'photos',
    version: '1.0.0',
    description: 'Photos for your organization',
    routes: { directory: 'screens' },
    publicRoutes: { directory: 'public-screens' },
    nav: {
        label: 'Photos',
        icon: 'aperture',
        order: 20,
        shortcut: 'p',
    },
    sidebar: { component: 'sidebar' },
    provider: { component: 'provider' },
    migrations: { directory: 'pb-migrations' },
    collections: { register: 'collections', types: 'types' },
    seed: { script: 'seed' },
    server: { package: 'server', module: 'tinycld.org/packages/photos' },
}

export default manifest
