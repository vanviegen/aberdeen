import { expect, test } from "bun:test";
import { $, insertCss, unmountAll } from "../src/aberdeen";
import { assertBody, assertCss } from './helpers';

test('Basic style', async () => {
  let cls = insertCss({
    color: 'red'
  });
  assertCss(`${cls}{color:red;}`);
});

test('Complex selectors', async () => {
  let cls = insertCss({
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
    `${cls}{margin:5;}`,
    `${cls} .x .y{font-weight:bold;}`,
    `${cls}:before{content:"BEFORE";}`,
    `body > ${cls}{margin-bottom:20px;}`,
    `body > ${cls} span{font-size:20;}`,
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
    `*{margin:4;}`,
    `h1{color:red;}`,
  );
})

test('Media queries', async () => {
  let cls = insertCss({
    '@media (max-width: 600px)': {
      flexDirection: 'column',
    },
    main: {
      '@media (max-width: 400px)': {
        button: {color: 'red'},
      },
    },
  });
  assertCss(
    `@media (max-width: 600px){`,
      `${cls}{flex-direction:column;}`,
    `}`,
    `@media (max-width: 400px){`,
      `.AbdStl1 main button{color:red;}`,
    `}`,
  );
})