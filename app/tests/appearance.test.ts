import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultAppearance, readAppearance, themes } from '../web/appearance';

test('appearance restores all approved palettes and modes without touching document storage',()=>{
 for(const theme of themes)for(const mode of ['light','dark','system'])assert.deepEqual(readAppearance(JSON.stringify({...defaultAppearance,theme:theme.id,mode,font:'serif',size:22,lineHeight:2.1,width:800})),{...defaultAppearance,theme:theme.id,mode,font:'serif',size:22,lineHeight:2.1,width:800});
});
test('missing, corrupt or unsupported appearance preferences retain readable defaults',()=>{
 for(const value of [null,'{','null','[]','{"theme":"unknown","mode":"unknown","font":"unknown","size":0,"lineHeight":9,"width":9000}'])assert.deepEqual(readAppearance(value),defaultAppearance);
 assert.deepEqual(readAppearance('{"theme":"wine","size":20}'),{...defaultAppearance,theme:'wine',size:20});
});
