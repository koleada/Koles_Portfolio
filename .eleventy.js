module.exports = function (eleventyConfig) {
    eleventyConfig.addPassthroughCopy("styles");
    eleventyConfig.addPassthroughCopy("images");
    eleventyConfig.addPassthroughCopy("scripts");

    eleventyConfig.addCollection("posts", function (collectionApi) {
        return collectionApi.getFilteredByGlob("writeups/posts/*.md").reverse();
    });

    return {
        dir: {
            input: ".",
            output: "_site",
            includes: "writeups/_includes"
        }
    };
};
