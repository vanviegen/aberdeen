import { test } from "bun:test";
import { insertCss, insertGlobalCss } from "../src/aberdeen";
import { assertCss } from './helpers';

test('Basic style', async () => {
  let cls = insertCss('color:red');
  assertCss(`${cls}{color:red;}`);
});

test('Complex selectors', async () => {
  let cls = insertCss({
    '&': 'margin:5',
    ".x .y": 'font-weight:bold',
    "&:before": 'content: "BEFORE";',
    "body > &": 'margin-bottom:20px',
    "body > & span": 'font-size:20',
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
  insertGlobalCss({
    '*': 'margin:4',
    'h1': 'color:red',
  });
  assertCss(
    `*{margin:4;}`,
    `h1{color:red;}`,
  );
})

test('Nested selectors with object values', async () => {
  let cls = insertCss({
    '&': 'display:flex',
    'button': {
      '&': 'bg:blue p:$2',
      '&:hover': 'bg:darkblue',
      '&:active': 'transform:scale(0.95)',
    },
  });
  assertCss(
    `${cls}{display:flex;}`,
    `${cls} button{background:blue;padding:var(--m2);}`,
    `${cls} button:hover{background:darkblue;}`,
    `${cls} button:active{transform:scale(0.95);}`,
  );
});

test('Media query with object containing multiple selectors', async () => {
  let cls = insertCss({
    '&': 'display:flex',
    '@media (max-width: 600px)': {
      '&': 'flex-direction:column',
      'button': 'width:100%',
      'input': 'font-size:16px',
    },
  });
  assertCss(
    `${cls}{display:flex;}`,
    `@media (max-width: 600px){`,
      `${cls}{flex-direction:column;}`,
      `${cls} button{width:100%;}`,
      `${cls} input{font-size:16px;}`,
    `}`,
  );
});

test('Media query with string value', async () => {
  let cls = insertCss({
    '&': 'color:black',
    '@media (prefers-color-scheme: dark)': 'color:white',
  });
  assertCss(
    `${cls}{color:black;}`,
    `@media (prefers-color-scheme: dark){`,
      `${cls}{color:white;}`,
    `}`,
  );
});

test('Media queries nested deeply get bubbled to outside', async () => {
  let cls = insertCss({
    '&': 'display:grid',
    'main': {
      '&': 'padding:$4',
      'section': {
        '&': 'margin:$2',
        '@media (max-width: 400px)': {
          '&': 'margin:$1',
          'button': 'font-size:14px',
        },
      },
    },
  });
  assertCss(
    `${cls}{display:grid;}`,
    `${cls} main{padding:var(--m4);}`,
    `${cls} main section{margin:var(--m2);}`,
    `@media (max-width: 400px){`,
      `${cls} main section{margin:var(--m1);}`,
      `${cls} main section button{font-size:14px;}`,
    `}`,
  );
});

test('Quoted values (e.g., content property)', async () => {
  let cls = insertCss({
    '&::before': `content: "★"; color:gold mr:$1`,
    '&::after': `content: "\\00A0"; display:inline-block`,
  });
  assertCss(
    `${cls}::before{content:"★";color:gold;margin-right:var(--m1);}`,
    `${cls}::after{content:"\\00A0";display:inline-block;}`,
  );
});

test('Multi-word values with space-colon-semicolon syntax', async () => {
  let cls = insertCss({
    '&': `border: 1px solid blue; transition: all 0.3s ease;`,
  });
  assertCss(
    `${cls}{border:1px solid blue;transition:all 0.3s ease;}`,
  );
});

test('Grid template areas with multiple quoted strings', async () => {
  let cls = insertCss({
    '&': `grid-template-areas: "header header" "sidebar content" "footer footer";`,
  });
  assertCss(
    `${cls}{grid-template-areas:"header header" "sidebar content" "footer footer";}`,
  );
});
