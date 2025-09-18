import sveltePreprocess from 'svelte-preprocess';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteOptions} */
const config = {
    compilerOptions: {
        hydratable: true
    },
    preprocess: sveltePreprocess({
        typescript: true
    })
};

export default config;
