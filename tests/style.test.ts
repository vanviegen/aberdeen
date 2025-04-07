import { expect, test } from "bun:test";
import { $, insertCss, unmountAll } from "../src/aberdeen";
import { assertBody, assertCss } from './helpers';

test('Basic style', async () => {
  insertCss({
    color: 'red'
  });
  assertCss(`.AbdStl1{color:red;}`);
});

test('Complex selectors', async () => {
  insertCss({
    margin: 5,
    ".empty": {},
    ".x": {
      ".y": {
        fontWeight: 'bold',
      },
    },
    "&:before": {
      content: '"BEFORE"',
    },
    "body > &": {
      marginBottom: "20px",
      span: {
        fontSize: 20,
      }
    },
  })
  assertCss(
    ".AbdStl1 .x .y{font-weight:bold;}",
    ".AbdStl1:before{content:\"BEFORE\";}",
    ".AbdStl1{margin:5;}",
    "body > .AbdStl1 span{font-size:20;}",
    "body > .AbdStl1{margin-bottom:20px;}"
  );
});

test('Global style', async () => {
  insertCss({
    h1: {
      color: 'red'
    },
    margin: 4,
  }, true);
  assertCss(
    `h1{color:red;}`,
    `*{margin:4;}`
  );
})
