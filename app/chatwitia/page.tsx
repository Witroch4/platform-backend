//app/chatwitia/page.tsx
'use client';

// Forçar renderização dinâmica para evitar erro de DOMMatrix no build
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Plus, ChevronDown, User2, X, ChevronRight, MoreVertical, Share, Edit, Archive, Trash2, LightbulbIcon, ArrowUp, Type, Mic, Settings, Upload, Image, Bold, Italic, List, ListOrdered, Heading, Code, FileCode, ImageIcon } from 'lucide-react';
import ChatwitIA from '@/app/components/ChatwitIA/ChatwithIA';
import ChatInputForm from '@/app/components/ChatInputForm';
import ImageGalleryModal from '@/app/components/ImageGallery';
import ChatSidebar from '@/components/chatwitia/ChatSidebar';

interface ChatHistory {
  id: string;
  title: string;
  date: string;
  createdAt: Date;
  dateGroup: string;
}

// Main models
const defaultMainModels = [
  { id: "gpt-5-chat-latest", name: "GPT-5", description: "Modelo mais avançado da OpenAI" },
  { id: "chatgpt-4o-latest", name: "ChatGPT 4o", description: "Excelente para a maioria das perguntas" },
  { id: "o3", name: "o3", description: "Usa reflexão avançada (baseado no gpt-4o-2024-05-13)" },
  { id: "o4-mini", name: "o4-mini", description: "Mais rápido em reflexão avançada" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 nano", description: "Fastest, most cost-effective GPT-4.1 model" },
  { id: "gpt-4.1", name: "GPT-4.1", description: "Ótimo para escrita e explorar ideias", beta: true, experimental: true },
  { id: "o4-mini-high", name: "o4-mini High", description: "Reflexão avançada com maior esforço de raciocínio", beta: true },
];

// Modelos adicionais - serão substituídos pelos modelos da API
const defaultAdditionalModels = [
  // GPT-4.1 Series
  { id: "gpt-4.1-latest", name: "GPT-4.1", description: "GPT-4.1 mais recente (gpt-4.1-2025-04-14)", category: "GPT-4.1" },
  { id: "gpt-4.1-mini-latest", name: "GPT-4.1 Mini", description: "Versão mais leve do GPT-4.1 (gpt-4.1-mini-2025-04-14)", category: "GPT-4.1" },
  // Exemplos de modelos que serão substituídos pela API
];

export default function ChatPage() {
  const router = useRouter();
  
  const [selectedModel, setSelectedModel] = useState('gpt-5-chat-latest');
  const [selectedModelName, setSelectedModelName] = useState('GPT-5');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showMoreModels, setShowMoreModels] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [mainModels, setMainModels] = useState(defaultMainModels);
  const [additionalModels, setAdditionalModels] = useState(defaultAdditionalModels);
  const [apiModels, setApiModels] = useState<any>({});
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [forceRemount, setForceRemount] = useState(0);
  const [inputValue, setInputValue] = useState('');
  
  // Estado para controlar a galeria de imagens
  const [showImageGallery, setShowImageGallery] = useState(false);
  
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Fechar os dropdowns de modelos quando clicar fora
      const targetElement = event.target as Element;
      
      // Se o clique não foi em um botão de modelo ou dentro do dropdown
      if (!targetElement.closest('[data-model-dropdown]') && 
          !targetElement.closest('[data-more-models]')) {
        setShowModelDropdown(false);
        setShowMoreModels(false);
        setActiveCategory(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const createNewChat = async () => {
    try {
        // Create a friendly title with date and time
        const now = new Date();
        const formattedDate = now.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        const formattedTime = now.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const chatTitle = `Conversa de ${formattedDate} às ${formattedTime}`;
        
        const response = await fetch('/api/chatwitia/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: chatTitle,
            model: selectedModel
          })
        });
        
        if (response.ok) {
          const newChat = await response.json();
          router.push(`/chatwitia/${newChat.id}`);
        }
      } catch (error) {
        console.error("Error creating new chat:", error);
    }
  };
  
  const handleModelSelect = (modelId: string, modelName: string) => {
    console.log(`Modelo selecionado - ID: ${modelId}, Nome: ${modelName}`);
    setSelectedModel(modelId);
    setSelectedModelName(modelName);
    setShowModelDropdown(false);
    setShowMoreModels(false);
    setActiveCategory(null);
  };
  
  // Organizing modelos adicionais por categoria
  const getModelsByCategory = () => {
    const categories: {[key: string]: Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      beta?: boolean;
      experimental?: boolean;
    }>} = {};
    
    additionalModels.forEach(model => {
      if (!categories[model.category]) {
        categories[model.category] = [];
      }
      categories[model.category].push(model);
    });
    
    return categories;
  };

  // Carregar modelos disponíveis da API
  const loadAvailableModels = async () => {
    try {
      setIsLoadingModels(true);
      const response = await fetch('/api/chatwitia');
      if (response.ok) {
        const data = await response.json();
        setApiModels(data);
        
        // Log para debug dos modelos disponíveis
        console.log('Modelos disponíveis da API:', data);
        
        // Processar GPT-4o e O Series para os modelos principais (manter os originais e adicionar novos)
        const gpt4oModels = data.models?.gpt4o || [];
        const oSeriesModels = data.models?.oSeries || [];
        
        // Adicionar modelos da API à lista de modelos adicionais
        const newAdditionalModels: Array<{
          id: string;
          name: string;
          description: string;
          category: string;
          beta?: boolean;
          experimental?: boolean;
        }> = [];
        
        // Processar modelos Claude da Anthropic
        if (data.models?.claude?.length) {
          data.models.claude.forEach((model: any) => {
            newAdditionalModels.push({
              id: model.id,
              name: model.display_name || model.id,
              description: `Modelo Anthropic ${model.id} (${model.created_at?.split('T')[0] || 'Data desconhecida'})`,
              category: 'Claude / Anthropic'
            });
          });
        }

        // Processar GPT-4
        if (data.models?.gpt4?.length) {
          data.models.gpt4.forEach((model: any) => {
            newAdditionalModels.push({
              id: model.id,
              name: model.id.replace('gpt-', 'GPT-').replace(/-/g, ' '),
              description: `Modelo ${model.id} (${model.created})`,
              category: 'GPT-4'
            });
          });
        }
        
        // Processar GPT-4o que não estão nos modelos principais
        if (data.models?.gpt4o?.length) {
          data.models.gpt4o.forEach((model: any) => {
            // Verificar se já não está nos modelos principais
            if (!mainModels.some(m => m.id === model.id)) {
              newAdditionalModels.push({
                id: model.id,
                name: model.id.replace('gpt-', 'GPT-').replace(/-/g, ' '),
                description: `Modelo ${model.id} (${model.created})`,
                category: 'GPT-4o'
              });
            }
          });
        }
        
        // Processar O Series que não estão nos modelos principais
        if (data.models?.oSeries?.length) {
          data.models.oSeries.forEach((model: any) => {
            // Verificar se já não está nos modelos principais
            if (!mainModels.some(m => m.id === model.id)) {
              newAdditionalModels.push({
                id: model.id,
                name: model.id,
                description: `Modelo ${model.id} (${model.created})`,
                category: 'O Series'
              });
            }
          });
        }
        
        // Processar GPT-3
        if (data.models?.gpt3?.length) {
          data.models.gpt3.forEach((model: any) => {
            newAdditionalModels.push({
              id: model.id,
              name: model.id.replace('gpt-', 'GPT-').replace(/-/g, ' '),
              description: `Modelo ${model.id} (${model.created})`,
              category: 'GPT-3'
            });
          });
        }
        
        // Processar GPT-5
        if (data.models?.gpt5?.length) {
          data.models.gpt5.forEach((model: any) => {
            newAdditionalModels.push({
              id: model.id,
              name: model.id.replace('gpt-', 'GPT-').replace(/-/g, ' '),
              description: `Modelo ${model.id} (${model.created})`,
              category: 'GPT-5'
            });
          });
        }
        
        // Adicionar outros modelos que existem como padrão
        defaultAdditionalModels.forEach(model => {
          if (!newAdditionalModels.some(m => m.id === model.id)) {
            newAdditionalModels.push(model);
          }
        });
        
        // Atualizar estado
        setAdditionalModels(newAdditionalModels);
      }
    } catch (error) {
      console.error("Erro ao carregar modelos disponíveis:", error);
    } finally {
      setIsLoadingModels(false);
    }
  };
  
  // Carregar modelos quando o componente é montado
  useEffect(() => {
    loadAvailableModels();
  }, []);

  const handleChatTitleChange = useCallback((title: string) => {
    // No action needed for direct title changes on the main page
  }, []);

  // This function will handle when a chat session is created and update the URL
  const handleSessionChange = useCallback((sessionId: string | null) => {
    if (sessionId) {
      // Redirect to the specific chat session page
      router.push(`/chatwitia/${sessionId}`);
    }
  }, [router]);

  // Function to handle initial user message submission
  const isSubmittingRef = useRef(false);
  
  const handleInitialMessage = useCallback((userInput: string) => {
    if (!userInput.trim() || isSubmittingRef.current) return Promise.resolve();
    
    // Prevent duplicate submissions
    isSubmittingRef.current = true;
    
    // Return a promise that resolves when the operation is complete
    return new Promise<void>((resolve) => {
      try {
        console.log("Criando nova sessão para mensagem:", userInput);
        console.log("Usando modelo selecionado:", selectedModel);
        
        // Generate a title from the user's message
        const userContent = userInput.replace(/\n/g, ' ').trim();
        const title = userContent.length > 40
          ? userContent.substring(0, 37) + '...'
          : userContent;
          
        // 1. Create a new session with the current model
        fetch('/api/chatwitia/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: title || 'Nova conversa',
            model: selectedModel
          })
        })
        .then(response => {
          if (response.ok) return response.json();
          throw new Error('Failed to create session');
        })
        .then(newChat => {
          console.log("Nova sessão criada com ID:", newChat.id);
          
          // 2. Store the pending message to be sent after navigation
          setInputValue(''); // Clear input immediately
          
          // 3. Store both the message and the model in sessionStorage
          if (typeof window !== "undefined") {
            // Store both message and model as a JSON string
            const pendingData = JSON.stringify({
              message: userInput,
              model: selectedModel
            });
            sessionStorage.setItem(`pending_${newChat.id}`, pendingData);
            
            // Add model to URL for immediate correct model loading
            router.push(`/chatwitia/${newChat.id}?model=${selectedModel}`);
          }
          resolve();
        })
        .catch(error => {
          console.error("Error creating new chat:", error);
          // Reset submission state in case of error
          isSubmittingRef.current = false;
          resolve();
        });
      } catch (error) {
        console.error("Error in handleInitialMessage:", error);
        // Reset submission state in case of error
        isSubmittingRef.current = false;
        resolve();
      }
    });
  }, [router, selectedModel]);

  // Função para lidar com geração de imagem na página inicial
  const handleGenerateImage = useCallback(async (prompt: string) => {
    console.log(`🎨 Página inicial - handleGenerateImage chamado com prompt: "${prompt}"`);
    
    if (!prompt.trim()) {
      return;
    }

    // Para a página inicial, tratamos geração de imagem como uma mensagem normal
    // O ChatwithIA na nova sessão irá detectar e processar adequadamente
    await handleInitialMessage(prompt);
  }, [handleInitialMessage]);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar with chat history */}
      <ChatSidebar 
        currentChatId={undefined}
        onCreateNewChat={createNewChat}
        onOpenGallery={() => setShowImageGallery(true)}
        selectedModel={selectedModel}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full">
        {/* Header with model selector */}
        <div className="border-b border-border flex items-center justify-between p-2">
          <div className="flex items-center">
            <div className="relative inline-block" data-model-dropdown="true">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-md hover:bg-accent transition-colors"
                data-model-dropdown="true"
              >
                <span className="text-foreground">{selectedModelName}</span>
                <ChevronDown size={16} className="text-muted-foreground" />
              </button>
              
              {showModelDropdown && (
                <div 
                  ref={modelDropdownRef}
                  className="absolute left-0 mt-1 w-80 bg-popover border border-border rounded-md shadow-lg z-50"
                  data-model-dropdown="true"
                >
                  <div className="p-3 border-b border-border">
                    <h3 className="font-medium text-sm mb-1 text-foreground">Modelo</h3>
                  </div>
                  
                  <div className="p-2" data-model-dropdown="true">
                    {/* Modelos principais */}
                    {mainModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          handleModelSelect(model.id, model.name);
                        }}
                        className={`w-full text-left flex items-start p-2 rounded-md hover:bg-accent ${
                          selectedModel === model.id ? 'bg-accent' : ''
                        }`}
                        data-model-dropdown="true"
                      >
                        <div className="flex-1">
                          <div className="flex items-center">
                            <span className="font-medium text-sm text-foreground">{model.name}</span>
                            {model.beta && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 rounded-full">
                                BETA
                              </span>
                            )}
                            {model.experimental && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full">
                                PRÉVIA EXPERIMENTAL
                              </span>
                            )}
                            {selectedModel === model.id && (
                              <svg className="w-4 h-4 ml-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                              </svg>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
                        </div>
                      </button>
                    ))}
                    
                    {/* Seção "Mais Modelos" */}
                    <div className="mt-2 border-t border-border pt-2 relative" data-model-dropdown="true">
                      <div 
                        className="w-full text-left p-2 rounded-md hover:bg-accent cursor-pointer"
                        onClick={() => setShowMoreModels(!showMoreModels)}
                        data-model-dropdown="true"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-foreground">Mais Modelos</span>
                          <ChevronRight 
                            size={16} 
                            className={`transition-transform text-muted-foreground ${showMoreModels ? 'rotate-90' : ''}`} 
                          />
                        </div>
                      </div>
                      
                      {showMoreModels && (
                        <div 
                          className="absolute left-full top-0 ml-1 w-80 bg-popover border border-border rounded-md shadow-lg z-50"
                          data-more-models="true"
                        >
                          <div className="p-2 max-h-96 overflow-y-auto" data-more-models="true">
                            {/* Exibir categorias */}
                            {Object.entries(getModelsByCategory()).map(([category, models]) => (
                              <div key={category} className="mb-2" data-more-models="true">
                                <div 
                                  className="font-medium text-sm p-2 border-b border-border cursor-pointer"
                                  onClick={() => setActiveCategory(activeCategory === category ? null : category)}
                                  data-more-models="true"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-foreground">{category}</span>
                                    <ChevronRight 
                                      size={14} 
                                      className={`transition-transform text-muted-foreground ${activeCategory === category ? 'rotate-90' : ''}`} 
                                    />
                                  </div>
                                </div>
                                
                                {(activeCategory === category || activeCategory === null) && (
                                  <div className="mt-1" data-more-models="true">
                                    {models.map(model => (
                                      <button
                                        key={model.id}
                                        onClick={() => {
                                          handleModelSelect(model.id, model.name);
                                          setShowMoreModels(false);
                                          setActiveCategory(null);
                                        }}
                                        className={`w-full text-left flex items-start p-2 rounded-md hover:bg-accent ${
                                          selectedModel === model.id ? 'bg-accent' : ''
                                        }`}
                                        data-more-models="true"
                                      >
                                        <div className="flex-1">
                                          <div className="flex items-center">
                                            <span className="font-medium text-sm text-foreground">{model.name}</span>
                                            {selectedModel === model.id && (
                                              <svg className="w-4 h-4 ml-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                              </svg>
                                            )}
                                          </div>
                                          <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Title display in header */}
          <div className="flex-1 text-center overflow-hidden px-4">
            <h1 className="text-sm font-medium truncate text-foreground">ChatwitIA</h1>
          </div>
          
          <div className="w-8"></div> {/* Spacer for balance */}
        </div>
        
        {/* Chat Interface - Agora usando diretamente o ChatInputForm */}
        <div className="flex-1 overflow-hidden">
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto pb-32">
              <div className="h-full flex flex-col items-center justify-center px-4">
                <h1 className="text-4xl font-bold mb-8 text-foreground">ChatwitIA</h1>
                
                <div className="max-w-2xl">
                  <h2 className="text-2xl font-medium text-center mb-5 text-foreground">Por onde começamos?</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
                    <button 
                      className="bg-muted/50 p-4 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                      onClick={() => handleInitialMessage("Explique como o GPT-4 funciona para um desenvolvedor")}
                    >
                      <div className="font-medium mb-1 text-foreground">Explique como o GPT-4 funciona</div>
                      <div className="text-sm text-muted-foreground">Para um desenvolvedor que quer entender a tecnologia</div>
                    </button>
                    
                    <button 
                      className="bg-muted/50 p-4 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                      onClick={() => handleInitialMessage("Crie um plano de estudo para aprender React e Next.js em 8 semanas")}
                    >
                      <div className="font-medium mb-1 text-foreground">Crie um plano de estudo</div>
                      <div className="text-sm text-muted-foreground">Para aprender React e Next.js em 8 semanas</div>
                    </button>
                    
                    <button 
                      className="bg-muted/50 p-4 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                      onClick={() => handleInitialMessage("Escreva uma API REST em Node.js para um sistema de agendamento")}
                    >
                      <div className="font-medium mb-1 text-foreground">Escreva uma API REST</div>
                      <div className="text-sm text-muted-foreground">Em Node.js para um sistema de agendamento</div>
                    </button>
                    
                    <button 
                      className="bg-muted/50 p-4 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                      onClick={() => handleInitialMessage("Gere um código para analisar e visualizar dados em Python com matplotlib")}
                    >
                      <div className="font-medium mb-1 text-foreground">Gere um código para análise de dados</div>
                      <div className="text-sm text-muted-foreground">Em Python com matplotlib</div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Direct usage of ChatInputForm for home page */}
            <ChatInputForm 
              key={`form-${selectedModel}`}
              input={inputValue}
              setInput={setInputValue}
              onSubmit={handleInitialMessage}
              isLoading={isSubmittingRef.current}
              systemPrompt={''}
              setSystemPrompt={() => {}}
              onAudioCapture={() => {}}
              onImageGenerate={() => {}}
              onGenerateImage={handleGenerateImage}
              handleTranscriptReady={(t) => setInputValue((p) => (p ? `${p} ${t}` : t))}
              files={[]}
              onUploadFile={() => Promise.resolve()}
              onDeleteFile={() => Promise.resolve()}
              onEditImage={() => Promise.resolve()}
              onVariationImage={() => Promise.resolve()}
              isFileLoading={false}
              currentSessionId={undefined}
              isCnisAnalysisActive={false}
              onToggleCnisAnalysis={() => {}}
              onSearchToggle={() => {}}
              onInvestigateToggle={() => {}}
            />
          </div>
        </div>
      </div>
      
      {/* Image Gallery Modal */}
      <ImageGalleryModal 
        isOpen={showImageGallery}
        onClose={() => setShowImageGallery(false)}
      />
    </div>
  );
} 