import type React from "react";
import { EditableTable } from "./EditableTable";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { produce } from "immer";

// Função para extrair texto de um nó
const getNodeText = (node: any): string => {
	if (!node) return "";
	if (node.type === "text") return node.value || "";
	if (node.children && node.children.length > 0) {
		return node.children.map((child: any) => getNodeText(child)).join("");
	}
	return "";
};

// Função para criar nós de texto
const createTextNode = (value: string) => ({
	type: "text",
	value,
});

// Função para atualizar nós de texto
const updateTextNode = (node: any, newValue: string) => {
	if (node.type === "text") {
		return { ...node, value: newValue };
	}
	if (node.children && node.children.length > 0) {
		return {
			...node,
			children: [createTextNode(newValue)],
		};
	}
	return node;
};

// Componente para editar um nó específico
interface EditableNodeProps {
	node: any;
	onNodeChange: (newNode: any) => void;
	onDeleteQuestion?: () => void; // Nova prop para deletar questão
}

const EditableNode: React.FC<EditableNodeProps> = ({ node, onNodeChange, onDeleteQuestion }) => {
	const handleSimpleChange = (newValue: string) => {
		const updatedNode = updateTextNode(node, newValue);
		onNodeChange(updatedNode);
	};

	const handleComplexChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		handleSimpleChange(e.target.value);
	};

	switch (node.type) {
		case "heading":
			const headingLevel = node.depth || 1;
			const headingText = getNodeText(node);
			const headingClass = `text-base font-bold my-2`;
			const isQuestion = headingText.match(/Questão\s+\d+/i);

			return (
				<div className="my-3">
					<div className="flex items-center justify-between mb-1">
						<div className="text-xs text-muted-foreground">Título (H{headingLevel})</div>
						{isQuestion && onDeleteQuestion && (
							<Button
								variant="ghost"
								onClick={onDeleteQuestion}
								className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
								title="Excluir questão completa"
							>
								<X className="h-4 w-4" />
							</Button>
						)}
					</div>
					<Input
						value={headingText}
						onChange={handleComplexChange}
						className={headingClass}
						placeholder={`Digite o título H${headingLevel}...`}
					/>
				</div>
			);

		case "paragraph":
			const paragraphText = getNodeText(node);

			return (
				<div className="my-3">
					<div className="text-xs text-muted-foreground mb-1">Parágrafo</div>
					<Textarea
						value={paragraphText}
						onChange={handleComplexChange}
						className="min-h-[60px] resize-none text-base"
						placeholder="Digite o texto do parágrafo..."
					/>
				</div>
			);

		case "table":
			return (
				<div className="my-3">
					<div className="text-xs text-muted-foreground mb-1">Tabela</div>
					<EditableTable tableNode={node} onNodeChange={onNodeChange} />
				</div>
			);

		case "list":
			// Verificar se a lista parece ser uma tabela (itens com estrutura de pontuação)
			const hasTableStructure = node.children?.some((item: any) => {
				const text = getNodeText(item);
				// Verificar se tem padrão de pontuação (ex: "0,10", "1,50", etc.) ou estrutura de tabela
				return text.match(/\d+[,\.]\d+/) || text.includes("|") || text.match(/[A-Z]\).*?[:].*/);
			});

			if (hasTableStructure) {
				// Renderizar como tabela editável
				return (
					<div className="my-3">
						<div className="text-xs text-muted-foreground mb-1">Tabela de Avaliação</div>
						<div className="border rounded-md overflow-hidden">
							<table className="w-full">
								<thead>
									<tr className="bg-gray-50 dark:bg-gray-700">
										<th className="p-2 text-left text-xs font-medium">Item</th>
										<th className="p-2 text-left text-xs font-medium">Pontuação Máxima</th>
										<th className="p-2 text-left text-xs font-medium">Nota Obtida</th>
										<th className="w-12 p-2 text-center">Ações</th>
									</tr>
								</thead>
								<tbody>
									{node.children?.map((listItem: any, index: number) => {
										const text = getNodeText(listItem);
										// Tentar extrair partes do texto (item, pontuação máxima, nota obtida)
										const parts = text.split(/[:|]/);
										const itemText = parts[0] || "";
										const pontuacaoMaxima = parts[1]?.match(/\d+[,\.]\d+/)?.[0] || "";
										const notaObtida = parts[2]?.match(/\d+[,\.]\d+/)?.[0] || "";

										return (
											<tr key={index} className="border-b hover:bg-gray-50 dark:hover:bg-gray-700">
												<td className="p-2">
													<Input
														value={itemText.trim()}
														onChange={(e) => {
															const newText = `${e.target.value}: ${pontuacaoMaxima} | ${notaObtida}`;
															const newNode = produce(node, (draft: any) => {
																if (draft.children[index]) {
																	draft.children[index].children = [createTextNode(newText)];
																}
															});
															onNodeChange(newNode);
														}}
														className="text-base"
														placeholder="Descrição do item..."
													/>
												</td>
												<td className="p-2">
													<Input
														value={pontuacaoMaxima}
														onChange={(e) => {
															const newText = `${itemText.trim()}: ${e.target.value} | ${notaObtida}`;
															const newNode = produce(node, (draft: any) => {
																if (draft.children[index]) {
																	draft.children[index].children = [createTextNode(newText)];
																}
															});
															onNodeChange(newNode);
														}}
														className="text-base"
														placeholder="0,00"
													/>
												</td>
												<td className="p-2">
													<Input
														value={notaObtida}
														onChange={(e) => {
															const newText = `${itemText.trim()}: ${pontuacaoMaxima} | ${e.target.value}`;
															const newNode = produce(node, (draft: any) => {
																if (draft.children[index]) {
																	draft.children[index].children = [createTextNode(newText)];
																}
															});
															onNodeChange(newNode);
														}}
														className="text-base"
														placeholder="0,00"
													/>
												</td>
												<td className="p-2 text-center">
													<Button
														variant="ghost"
														onClick={() => {
															const newNode = produce(node, (draft: any) => {
																draft.children.splice(index, 1);
															});
															onNodeChange(newNode);
														}}
														className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
													>
														<X className="h-4 w-4" />
													</Button>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
							<div className="p-3 border-t bg-gray-50 dark:bg-gray-800">
								<Button
									variant="outline"
									onClick={() => {
										const newNode = produce(node, (draft: any) => {
											if (!draft.children) draft.children = [];
											draft.children.push({
												type: "listItem",
												children: [createTextNode("Novo item: 0,00 | 0,00")],
											});
										});
										onNodeChange(newNode);
									}}
									className="text-blue-600 hover:text-blue-800"
								>
									<Plus className="h-4 w-4 mr-1" />
									Adicionar Linha
								</Button>
							</div>
						</div>
					</div>
				);
			}

			// Renderizar como lista normal para questões
			return (
				<div className="my-3">
					<div className="text-xs text-muted-foreground mb-1">
						Lista ({node.ordered ? "Numerada" : "Com Marcadores"})
					</div>
					<div className="border rounded-md p-3 bg-gray-50 dark:bg-gray-800">
						{node.children?.map((listItem: any, index: number) => (
							<div key={index} className="flex items-start gap-2 mb-2">
								<span className="text-sm font-medium mt-1">{node.ordered ? `${index + 1}.` : "•"}</span>
								<div className="flex-1">
									<Input
										value={getNodeText(listItem)}
										onChange={(e) => {
											const newNode = produce(node, (draft: any) => {
												if (draft.children[index]) {
													draft.children[index].children = [createTextNode(e.target.value)];
												}
											});
											onNodeChange(newNode);
										}}
										className="text-base"
										placeholder="Digite o item da lista..."
									/>
								</div>
								<Button
									variant="ghost"
									onClick={() => {
										const newNode = produce(node, (draft: any) => {
											draft.children.splice(index, 1);
										});
										onNodeChange(newNode);
									}}
									className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						))}
						<Button
							variant="outline"
							onClick={() => {
								const newNode = produce(node, (draft: any) => {
									if (!draft.children) draft.children = [];
									const nextIndex = draft.children.length;
									const nextLetter = String.fromCharCode(65 + nextIndex); // A, B, C, D...
									draft.children.push({
										type: "listItem",
										children: [createTextNode(`${nextLetter}) `)],
									});
								});
								onNodeChange(newNode);
							}}
							className="mt-2 text-blue-600 hover:text-blue-800"
						>
							<Plus className="h-4 w-4 mr-1" />
							Adicionar Item
						</Button>
					</div>
				</div>
			);

		case "strong":
			return (
				<div className="my-3">
					<div className="text-xs text-muted-foreground mb-1">Texto em Negrito</div>
					<Input
						value={getNodeText(node)}
						onChange={handleComplexChange}
						className="font-bold text-base"
						placeholder="Digite o texto em negrito..."
					/>
				</div>
			);

		case "emphasis":
			return (
				<div className="my-3">
					<div className="text-xs text-muted-foreground mb-1">Texto em Itálico</div>
					<Input
						value={getNodeText(node)}
						onChange={handleComplexChange}
						className="italic text-base"
						placeholder="Digite o texto em itálico..."
					/>
				</div>
			);

		case "blockquote":
			return (
				<div className="my-3">
					<div className="text-xs text-muted-foreground mb-1">Citação</div>
					<Textarea
						value={getNodeText(node)}
						onChange={handleComplexChange}
						className="border-l-4 border-blue-500 pl-4 italic bg-blue-50 dark:bg-blue-900/20 text-base"
						placeholder="Digite a citação..."
					/>
				</div>
			);

		case "code":
			return (
				<div className="my-3">
					<div className="text-xs text-muted-foreground mb-1">Código</div>
					<Textarea
						value={getNodeText(node)}
						onChange={handleComplexChange}
						className="font-mono text-base bg-gray-100 dark:bg-gray-800"
						placeholder="Digite o código..."
					/>
				</div>
			);

		default:
			// Para outros tipos de nós que não são relevantes para o usuário, não renderizar nada
			const hiddenTypes = ["thematicBreak", "break", "html", "yaml", "toml", "definition", "footnoteDefinition"];

			if (hiddenTypes.includes(node.type)) {
				return null;
			}

			// Para outros tipos de nós desconhecidos, renderizar como texto editável se tiver conteúdo
			const nodeText = getNodeText(node);
			if (!nodeText || nodeText.trim() === "") {
				return null;
			}

			return (
				<div className="my-3">
					<div className="text-xs text-muted-foreground mb-1">Texto</div>
					<Textarea
						value={nodeText}
						onChange={handleComplexChange}
						className="min-h-[60px] resize-none text-base"
						placeholder="Digite o texto..."
					/>
				</div>
			);
	}
};

interface StructuredEditorProps {
	ast: any;
	onAstChange: (newAst: any) => void;
}

export const StructuredEditor: React.FC<StructuredEditorProps> = ({ ast, onAstChange }) => {
	if (!ast || !ast.children) {
		return (
			<div className="p-4 text-center text-muted-foreground">
				<p>Nenhum conteúdo disponível para edição</p>
			</div>
		);
	}

	const handleNodeChange = (index: number, newNode: any) => {
		const newAst = produce(ast, (draft: any) => {
			draft.children[index] = newNode;
		});
		onAstChange(newAst);
	};

	const deleteQuestion = (questionIndex: number) => {
		const newAst = produce(ast, (draft: any) => {
			const questionNode = draft.children[questionIndex];

			// Verificar se é um título de questão
			if (questionNode.type === "heading") {
				const titleText = getNodeText(questionNode);
				const isQuestion = titleText.match(/Questão\s+\d+/i);

				if (isQuestion) {
					// Encontrar e remover a lista associada à questão
					const indicesToRemove = [questionIndex]; // Incluir o título

					// Procurar pela lista logo após o título
					for (let i = questionIndex + 1; i < draft.children.length; i++) {
						const node = draft.children[i];
						if (node.type === "list") {
							indicesToRemove.push(i);
							break;
						}
						// Se encontrar outro título, parar a busca
						if (node.type === "heading") {
							break;
						}
					}

					// Remover os nós em ordem reversa para não afetar os índices
					indicesToRemove.reverse().forEach((index) => {
						draft.children.splice(index, 1);
					});
				}
			}
		});
		onAstChange(newAst);
	};

	const addNewQuestion = () => {
		const newAst = produce(ast, (draft: any) => {
			// Encontrar a última questão para usar como modelo
			let lastQuestionIndex = -1;
			let lastQuestionNumber = 0;

			// Procurar pela última questão (título H4 que contenha "Questão")
			for (let i = draft.children.length - 1; i >= 0; i--) {
				const node = draft.children[i];
				if (node.type === "heading" && node.depth === 4) {
					const titleText = getNodeText(node);
					const match = titleText.match(/Questão\s+(\d+)/i);
					if (match) {
						lastQuestionIndex = i;
						lastQuestionNumber = Number.parseInt(match[1]);
						break;
					}
				}
			}

			const newQuestionNumber = lastQuestionNumber + 1;

			// Adicionar novo título da questão
			draft.children.push({
				type: "heading",
				depth: 4,
				children: [createTextNode(`Questão ${newQuestionNumber.toString().padStart(2, "0")}`)],
			});

			// Encontrar a lista da questão anterior para usar como modelo
			let modelList = null;
			if (lastQuestionIndex >= 0) {
				// Procurar pela lista logo após o título da questão anterior
				for (let i = lastQuestionIndex + 1; i < draft.children.length; i++) {
					const node = draft.children[i];
					if (node.type === "list") {
						modelList = node;
						break;
					}
					// Se encontrar outro título, parar a busca
					if (node.type === "heading") {
						break;
					}
				}
			}

			// Criar nova lista baseada no modelo ou lista padrão
			if (modelList && modelList.children && modelList.children.length > 0) {
				// Criar lista baseada no modelo da questão anterior
				const newList = {
					type: "list",
					ordered: false,
					children: modelList.children.map((item: any, index: number) => {
						const letter = String.fromCharCode(65 + index); // A, B, C, D...
						return {
							type: "listItem",
							children: [createTextNode(`${letter}) `)],
						};
					}),
				};
				draft.children.push(newList);
			} else {
				// Lista padrão com A, B, C, D
				draft.children.push({
					type: "list",
					ordered: false,
					children: [
						{
							type: "listItem",
							children: [createTextNode("A) ")],
						},
						{
							type: "listItem",
							children: [createTextNode("B) ")],
						},
						{
							type: "listItem",
							children: [createTextNode("C) ")],
						},
						{
							type: "listItem",
							children: [createTextNode("D) ")],
						},
					],
				});
			}
		});
		onAstChange(newAst);
	};

	// Filtrar elementos não relevantes para o usuário
	const hiddenTypes = ["thematicBreak", "break", "html", "yaml", "toml", "definition", "footnoteDefinition"];
	const visibleNodes = ast.children.filter((node: any) => {
		if (hiddenTypes.includes(node.type)) {
			return false;
		}
		// Também filtrar nós vazios
		const nodeText = getNodeText(node);
		return nodeText && nodeText.trim() !== "";
	});

	if (visibleNodes.length === 0) {
		return (
			<div className="p-4 text-center text-muted-foreground">
				<p>Nenhum conteúdo editável disponível</p>
			</div>
		);
	}

	return (
		<div className="space-y-2 h-[600px] pr-2">
			{visibleNodes.map((node: any, index: number) => {
				// Encontrar o índice original do nó no AST
				const originalIndex = ast.children.findIndex((originalNode: any) => originalNode === node);

				return (
					<EditableNode
						key={originalIndex}
						node={node}
						onNodeChange={(newNode) => handleNodeChange(originalIndex, newNode)}
						onDeleteQuestion={() => deleteQuestion(originalIndex)}
					/>
				);
			})}

			{/* Botão para adicionar nova questão */}
			<div className="mt-4 pt-4 border-t">
				<Button
					variant="outline"
					onClick={addNewQuestion}
					className="w-full text-green-600 hover:text-green-800 border-green-300 hover:border-green-500"
				>
					<Plus className="h-4 w-4 mr-2" />
					Adicionar Nova Questão
				</Button>
			</div>
		</div>
	);
};
