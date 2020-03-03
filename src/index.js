const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const validateOptions = require('schema-utils');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { parse } = require('node-html-parser');
const schema = require('./WebMaterial.schema.json');

const readFile = promisify(fs.readFile);

const PLUGIN_NAME = 'WebMaterialPlugin';

module.exports = class WebMaterialPlugin {
  constructor(options) {
    validateOptions(schema, options, {
      baseDataPath: 'options',
      name: PLUGIN_NAME
    });
    
    this.options = options;
  }
  apply(compiler) {
    compiler.hooks.compilation.tap(PLUGIN_NAME, compilation => {
      HtmlWebpackPlugin
        .getHooks(compilation)
        .alterAssetTagGroups
        .tapAsync(PLUGIN_NAME, async (data, cb) => {
          const tags = await createTemplateTags(Array.from(compilation.fileDependencies), this.options.test);

          tags.forEach(({ innerHTML, name }) => {
            data.headTags.push({
              attributes: {
                id: `template-${name}`
              },
              innerHTML,
              tagName: 'template',
              voidTag: false
            });
          });

          cb(null, data);
        });
    });
  }
};

function checkCssHref(href) {
  let result = true;

  if (!href) {
    result = false;
  }

  let url;

  try {
    url = new URL(href);
  } catch (err) {
    return result;
  }

  if (url.protocol) {
    result = false;
  }

  return result;
}

async function createTemplateTags(files, pattern) {
  const targetFiles = files.filter(filePath => pattern.test(filePath));

  const allTemplates = await Promise.all(targetFiles.map(async filePath => {
    const { name } = path.parse(filePath);
    const folderPath = path.dirname(filePath);
    const templatePath = path.join(folderPath, 'index.html');
    let template;
    let innerHTML;

    try {
      template = await readFile(templatePath, { encoding: 'utf8' });
    } catch (err) {
      // this case is not necessarily a mistake
    }

    if (template) {
      const dom = parse(template);
      const content = dom.querySelector('template');
      const links = Array.from(content.querySelectorAll('link'));

      links.forEach((link, index) => {
        const href = link.getAttribute('href');

        if (!checkCssHref(href)) {
          return;
        }

        let text;

        try {
          const cssPath = path.resolve(folderPath, href);
          text = fs.readFileSync(cssPath, { encoding: 'utf-8' });
        } catch (err) {
          // seems like an error
          console.error(err);
        }

        link.removeAttribute('href');

        if (!text) {
          return;
        }

        const styleId = `web-material-inline-style-${index}`;
        content.insertAdjacentHTML('afterbegin', `<style id="${styleId}"></style>`);
        const inlined = dom.querySelector(`#${styleId}`);
        inlined.set_content(text);
        inlined.removeAttribute('id');
      });

      if (content && content.innerHTML) {
        innerHTML = content.innerHTML;
      }
    }

    return {
      innerHTML,
      name
    };
  }));

  const templates = allTemplates.filter(({ innerHTML }) => !!innerHTML);
  return templates;
}
