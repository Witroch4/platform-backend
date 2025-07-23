/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useVariableManager } from '../useVariableManager';

// Mock the fetch function
global.fetch = jest.fn();

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn()
  }
}));

describe('useVariableManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it('should initialize with loading state', () => {
    // Mock successful API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        variaveis: [
          { id: '1', chave: 'chave_pix', valor: '12345678901' },
          { id: '2', chave: 'nome_do_escritorio_rodape', valor: 'Test Company' }
        ]
      })
    });

    const { result } = renderHook(() => useVariableManager());

    expect(result.current.loading).toBe(true);
    expect(result.current.variables).toEqual([]);
  });

  it('should load variables on mount', async () => {
    const mockVariables = [
      { id: '1', chave: 'chave_pix', valor: '12345678901' },
      { id: '2', chave: 'nome_do_escritorio_rodape', valor: 'Test Company' },
      { id: '3', chave: 'custom_var', valor: 'Custom Value' }
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        variaveis: mockVariables
      })
    });

    const { result } = renderHook(() => useVariableManager());

    // Wait for the effect to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.variables).toHaveLength(3);
    expect(result.current.specialVariables).toHaveLength(2);
    expect(result.current.customVariables).toHaveLength(1);
  });

  it('should provide utility functions', async () => {
    const mockVariables = [
      { id: '1', chave: 'chave_pix', valor: '12345678901' },
      { id: '2', chave: 'nome_do_escritorio_rodape', valor: 'Test Company' }
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        variaveis: mockVariables
      })
    });

    const { result } = renderHook(() => useVariableManager());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Test utility functions
    expect(result.current.getCompanyName()).toBe('Test Company');
    expect(result.current.getPixKey()).toBe('12345678901');
    
    const autoFooter = result.current.getAutoFooter('Custom footer');
    expect(autoFooter).toBe('Custom footer\n\n{{nome_do_escritorio_rodape}}');

    const template = result.current.createTemplateWithAutoFooter('Header', 'Body', 'Footer');
    expect(template.footer).toBe('Footer\n\n{{nome_do_escritorio_rodape}}');
  });

  it('should validate variables correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, variaveis: [] })
    });

    const { result } = renderHook(() => useVariableManager());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const validVariables = [
      { chave: 'valid_var', valor: 'Valid Value' },
      { chave: 'chave_pix', valor: '12345' }
    ];

    const invalidVariables = [
      { chave: 'Invalid_Var', valor: 'Value' }, // Invalid name
      { chave: 'valid_var', valor: '' } // Empty value
    ];

    const validResult = result.current.validateAllVariables(validVariables);
    expect(validResult.isValid).toBe(true);

    const invalidResult = result.current.validateAllVariables(invalidVariables);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  it('should handle save variables with validation', async () => {
    // Mock initial load
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, variaveis: [] })
    });

    const { result } = renderHook(() => useVariableManager());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Mock save response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    // Mock refresh after save
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, variaveis: [] })
    });

    const validVariables = [
      { chave: 'chave_pix', valor: '12345' },
      { chave: 'nome_do_escritorio_rodape', valor: 'Test Company' }
    ];

    let saveResult: boolean = false;
    await act(async () => {
      saveResult = await result.current.saveVariables(validVariables);
    });

    expect(saveResult).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/mtf-diamante/variaveis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variaveis: [
          { chave: 'chave_pix', valor: '12345' },
          { chave: 'nome_do_escritorio_rodape', valor: 'Test Company' }
        ]
      })
    });
  });

  it('should handle save failure', async () => {
    // Mock initial load
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, variaveis: [] })
    });

    const { result } = renderHook(() => useVariableManager());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Mock save failure
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Save failed' })
    });

    const validVariables = [
      { chave: 'chave_pix', valor: '12345' },
      { chave: 'nome_do_escritorio_rodape', valor: 'Test Company' }
    ];

    let saveResult: boolean = true;
    await act(async () => {
      saveResult = await result.current.saveVariables(validVariables);
    });

    expect(saveResult).toBe(false);
  });
});