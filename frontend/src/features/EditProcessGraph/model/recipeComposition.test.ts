import {describe, expect, it} from 'vitest';
import type {CanvasGraph} from './excalidraw';
import {recipeComposition} from './recipeComposition';

const graph: CanvasGraph = {schemaVersion: 1, name: 'Сборка', outputItemId: null, nodes: [
  {id: 'material', type: 'material'}, {id: 'semi', type: 'manufactured_item'},
  {id: 'output', type: 'output'}, {id: 'island', type: 'material'},
], edges: [
  {id: 'a', source: 'material', target: 'semi', quantity: '2.5'},
  {id: 'b', source: 'semi', target: 'output', quantity: '3'},
  {id: 'c', source: 'material', target: 'output', quantity: '1'},
]};

describe('recipeComposition', () => {
  it('adds demands across branches and ignores disconnected nodes', () => {
    const recipe = recipeComposition(graph, 'output');
    expect(recipe.quantities.get('material')).toBe('8.500000');
    expect(recipe.quantities.get('semi')).toBe('3.000000');
    expect(recipe.ids.has('island')).toBe(false);
    expect(recipe.error).toBeUndefined();
  });
  it('stops at the requested semi-finished target', () => {
    const recipe = recipeComposition(graph, 'semi');
    expect([...recipe.ids].sort()).toEqual(['material', 'semi']);
    expect(recipe.quantities.get('material')).toBe('2.500000');
  });
  it('uses exact decimal quantities and the production rounding precision', () => {
    const decimalGraph = {...graph, edges: [
      {id: 'a', source: 'material', target: 'semi', quantity: '0.1'},
      {id: 'b', source: 'semi', target: 'output', quantity: '0.2'},
      {id: 'c', source: 'material', target: 'output', quantity: '0.3'},
    ]};
    expect(recipeComposition(decimalGraph, 'output').quantities.get('material')).toBe('0.320000');
  });
  it('reports cycles and missing quantities without looping', () => {
    expect(recipeComposition({...graph, edges: [...graph.edges,
      {id: 'cycle', source: 'semi', target: 'material', quantity: '1'}]}, 'output').error).toContain('цикл');
    expect(recipeComposition({...graph, edges: graph.edges.map((edge) => ({...edge, quantity: null}))}, 'output').error).toContain('положительные');
  });
});
