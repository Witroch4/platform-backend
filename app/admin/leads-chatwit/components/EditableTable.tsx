import type React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';

// Função para extrair o texto de uma célula da árvore
const getCellText = (cell: any): string => {
  if (!cell || !cell.children || cell.children.length === 0) return '';
  return cell.children[0]?.value || '';
};

interface EditableTableProps {
  tableNode: any;
  onNodeChange: (newNode: any) => void;
}

export const EditableTable: React.FC<EditableTableProps> = ({ tableNode, onNodeChange }) => {
  const handleCellChange = (rowIndex: number, cellIndex: number, value: string) => {
    const newTableNode = JSON.parse(JSON.stringify(tableNode));
    if (!newTableNode.children[rowIndex]) return;
    if (!newTableNode.children[rowIndex].children[cellIndex]) return;
    
    newTableNode.children[rowIndex].children[cellIndex].children = [
      { type: 'text', value }
    ];
    onNodeChange(newTableNode);
  };

  const addRow = () => {
    const newTableNode = JSON.parse(JSON.stringify(tableNode));
    const columnCount = newTableNode.children[0]?.children.length || 1;
    
    const newRow = {
      type: 'tableRow',
      children: Array(columnCount).fill(0).map(() => ({
        type: 'tableCell',
        children: [{ type: 'text', value: '' }]
      }))
    };
    
    newTableNode.children.push(newRow);
    onNodeChange(newTableNode);
  };

  const deleteRow = (rowIndex: number) => {
    const newTableNode = JSON.parse(JSON.stringify(tableNode));
    if (rowIndex > 0 && newTableNode.children.length > 2) { // Não permitir deletar o cabeçalho e manter pelo menos 1 linha de dados
      newTableNode.children.splice(rowIndex, 1);
      onNodeChange(newTableNode);
    }
  };
  
  // A primeira linha (index 0) é o cabeçalho
  const headerRow = tableNode.children[0];
  // O resto das linhas são o corpo da tabela
  const bodyRows = tableNode.children.slice(1);

  return (
    <div className="my-4 p-3 border rounded-md bg-white dark:bg-gray-800">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b bg-gray-50 dark:bg-gray-700">
              {headerRow?.children?.map((cell: any, index: number) => (
                <th key={index} className="p-2 text-left font-semibold text-sm">
                  {getCellText(cell)}
                </th>
              ))}
              <th className="w-12 p-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row: any, rowIndex: number) => (
              <tr key={rowIndex} className="border-b hover:bg-gray-50 dark:hover:bg-gray-700">
                {row.children.map((cell: any, cellIndex: number) => (
                  <td key={cellIndex} className="p-2">
                    <Input
                      type="text"
                      value={getCellText(cell)}
                      onChange={(e) => handleCellChange(rowIndex + 1, cellIndex, e.target.value)}
                      className="w-full text-sm"
                      placeholder="Digite o valor..."
                    />
                  </td>
                ))}
                <td className="p-2 text-center">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteRow(rowIndex + 1)}
                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                    title="Excluir linha"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button 
        onClick={addRow} 
        variant="outline" 
         
        className="mt-3"
      >
        <Plus className="h-4 w-4 mr-2" />
        Adicionar Linha
      </Button>
    </div>
  );
}; 