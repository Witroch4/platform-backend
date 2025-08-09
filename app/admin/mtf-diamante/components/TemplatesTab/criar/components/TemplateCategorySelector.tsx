import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Megaphone, Wrench, ShieldCheck } from "lucide-react";

interface CategorySelectorProps {
  selectedCategory: string;
  onSelectCategory: (category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION') => void;
}

const categories = [
  { id: 'MARKETING', name: 'Marketing', icon: <Megaphone className="h-6 w-6" /> },
  { id: 'UTILITY', name: 'Utilidade', icon: <Wrench className="h-6 w-6" /> },
  { id: 'AUTHENTICATION', name: 'Autenticação', icon: <ShieldCheck className="h-6 w-6" /> },
];

export const TemplateCategorySelector = ({ selectedCategory, onSelectCategory }: CategorySelectorProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Configurar seu modelo</CardTitle>
      <CardDescription>Escolha a categoria que melhor descreve seu modelo.</CardDescription>
    </CardHeader>
    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {categories.map(({ id, name, icon }) => (
        <button
          key={id}
          onClick={() => onSelectCategory(id as any)}
          className={`flex flex-col items-center justify-center py-5 px-4 border rounded-md transition-all duration-200 ${
            selectedCategory === id
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
              : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}>
          <div className={`rounded-full p-2 mb-2 ${
              selectedCategory === id ? 'bg-blue-100 dark:bg-blue-900' : 'bg-gray-100 dark:bg-gray-700'
            }`}>
            <div className={selectedCategory === id ? 'text-blue-700 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200'}>
              {icon}
            </div>
          </div>
          <span className={`text-center font-medium ${
              selectedCategory === id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
            }`}>
            {name}
          </span>
        </button>
      ))}
    </CardContent>
  </Card>
);
