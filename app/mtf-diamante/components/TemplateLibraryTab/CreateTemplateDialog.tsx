"use client";

import type React from "react";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { CreateTemplateLibraryData, TemplateLibraryContent } from "@/app/lib/template-library-service";

interface CreateTemplateDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: Omit<CreateTemplateLibraryData, "createdById">) => Promise<void>;
}

export function CreateTemplateDialog({ open, onOpenChange, onSubmit }: CreateTemplateDialogProps) {
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		type: "template" as "template" | "interactive_message",
		scope: "global" as "global" | "account_specific",
		category: "",
		language: "pt_BR",
		tags: [] as string[],
		content: {
			header: "",
			body: "",
			footer: "",
			buttons: [],
			variables: [],
			mediaUrl: "",
			mediaType: "",
		} as TemplateLibraryContent,
	});

	const [newTag, setNewTag] = useState("");
	const [newVariable, setNewVariable] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);

		try {
			// Extract variables from content
			const allText = [formData.content.header, formData.content.body, formData.content.footer]
				.filter(Boolean)
				.join(" ");

			const variableMatches = allText.match(/{{([^}]+)}}/g) || [];
			const extractedVariables = [...new Set(variableMatches.map((match) => match.replace(/[{}]/g, "")))];

			const submitData: Omit<CreateTemplateLibraryData, "createdById"> = {
				...formData,
				type: formData.type === "template" ? "WHATSAPP_OFFICIAL" : "INTERACTIVE_MESSAGE",
				scope: formData.scope === "global" ? "GLOBAL" : "PRIVATE",
				content: {
					...formData.content,
					variables: [...new Set([...formData.content.variables, ...extractedVariables])],
				},
			};

			await onSubmit(submitData);

			// Reset form
			setFormData({
				name: "",
				description: "",
				type: "template",
				scope: "global",
				category: "",
				language: "pt_BR",
				tags: [],
				content: {
					header: "",
					body: "",
					footer: "",
					buttons: [],
					variables: [],
					mediaUrl: "",
					mediaType: "",
				},
			});
		} catch (error) {
			console.error("Error creating template:", error);
		} finally {
			setLoading(false);
		}
	};

	const addTag = () => {
		if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
			setFormData((prev) => ({
				...prev,
				tags: [...prev.tags, newTag.trim()],
			}));
			setNewTag("");
		}
	};

	const removeTag = (tagToRemove: string) => {
		setFormData((prev) => ({
			...prev,
			tags: prev.tags.filter((tag) => tag !== tagToRemove),
		}));
	};

	const addVariable = () => {
		if (newVariable.trim() && !formData.content.variables.includes(newVariable.trim())) {
			setFormData((prev) => ({
				...prev,
				content: {
					...prev.content,
					variables: [...prev.content.variables, newVariable.trim()],
				},
			}));
			setNewVariable("");
		}
	};

	const removeVariable = (variableToRemove: string) => {
		setFormData((prev) => ({
			...prev,
			content: {
				...prev.content,
				variables: prev.content.variables.filter((variable) => variable !== variableToRemove),
			},
		}));
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create Template Library Item</DialogTitle>
					<DialogDescription>Create a new template or interactive message for the shared library.</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{/* Basic Information */}
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name *</Label>
							<Input
								id="name"
								value={formData.name}
								onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
								placeholder="Template name"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="category">Category</Label>
							<Input
								id="category"
								value={formData.category}
								onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
								placeholder="e.g., Marketing, Support"
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Textarea
							id="description"
							value={formData.description}
							onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
							placeholder="Brief description of the template"
							rows={2}
						/>
					</div>

					{/* Type and Scope */}
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Type *</Label>
							<Select
								value={formData.type}
								onValueChange={(value: "template" | "interactive_message") =>
									setFormData((prev) => ({ ...prev, type: value }))
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="template">Template</SelectItem>
									<SelectItem value="interactive_message">Interactive Message</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Scope *</Label>
							<Select
								value={formData.scope}
								onValueChange={(value: "global" | "account_specific") =>
									setFormData((prev) => ({ ...prev, scope: value }))
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="global">Global</SelectItem>
									<SelectItem value="account_specific">Account Specific</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Content */}
					<div className="space-y-4">
						<h4 className="font-medium">Content</h4>

						<div className="space-y-2">
							<Label htmlFor="header">Header</Label>
							<Input
								id="header"
								value={formData.content.header}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										content: { ...prev.content, header: e.target.value },
									}))
								}
								placeholder="Optional header text"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="body">Body *</Label>
							<Textarea
								id="body"
								value={formData.content.body}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										content: { ...prev.content, body: e.target.value },
									}))
								}
								placeholder="Main message content. Use {{variable_name}} for variables."
								rows={4}
								required
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="footer">Footer</Label>
							<Input
								id="footer"
								value={formData.content.footer}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										content: { ...prev.content, footer: e.target.value },
									}))
								}
								placeholder="Optional footer text"
							/>
						</div>
					</div>

					{/* Variables */}
					<div className="space-y-2">
						<Label>Variables</Label>
						<div className="flex gap-2">
							<Input
								value={newVariable}
								onChange={(e) => setNewVariable(e.target.value)}
								placeholder="Add variable name"
								onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addVariable())}
							/>
							<Button type="button" onClick={addVariable} variant="outline">
								Add
							</Button>
						</div>
						<div className="flex flex-wrap gap-2">
							{formData.content.variables.map((variable) => (
								<Badge key={variable} variant="secondary" className="flex items-center gap-1">
									{variable}
									<X className="h-3 w-3 cursor-pointer" onClick={() => removeVariable(variable)} />
								</Badge>
							))}
						</div>
					</div>

					{/* Tags */}
					<div className="space-y-2">
						<Label>Tags</Label>
						<div className="flex gap-2">
							<Input
								value={newTag}
								onChange={(e) => setNewTag(e.target.value)}
								placeholder="Add tag"
								onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
							/>
							<Button type="button" onClick={addTag} variant="outline">
								Add
							</Button>
						</div>
						<div className="flex flex-wrap gap-2">
							{formData.tags.map((tag) => (
								<Badge key={tag} variant="outline" className="flex items-center gap-1">
									{tag}
									<X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(tag)} />
								</Badge>
							))}
						</div>
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={loading}>
							{loading ? "Creating..." : "Create Template"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
