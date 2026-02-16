"use client";

import { useState, useCallback, useEffect } from "react";

export interface GalleryImage {
	id: string;
	imageUrl: string;
	thumbnailUrl?: string;
	prompt: string;
	revisedPrompt?: string;
	model: string;
	createdAt: string;
	chatSession?: {
		id: string;
		title: string;
		createdAt: string;
	};
}

export const useImageGallery = () => {
	const [images, setImages] = useState<GalleryImage[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [total, setTotal] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const [offset, setOffset] = useState(0);

	const loadImages = useCallback(
		async (reset = false) => {
			setIsLoading(true);
			setError(null);

			try {
				const currentOffset = reset ? 0 : offset;
				const response = await fetch(`/api/chatwitia/images/gallery?limit=20&offset=${currentOffset}`);

				if (!response.ok) {
					throw new Error("Erro ao carregar galeria");
				}

				const data = await response.json();

				if (data.success) {
					if (reset) {
						setImages(data.images);
						setOffset(20);
					} else {
						setImages((prev) => [...prev, ...data.images]);
						setOffset((prev) => prev + 20);
					}

					setTotal(data.total);
					setHasMore(data.hasMore);
				} else {
					throw new Error(data.error || "Erro desconhecido");
				}
			} catch (error: unknown) {
				console.error("Erro ao carregar galeria:", error);
				const message = error instanceof Error ? error.message : "Erro ao carregar galeria";
				setError(message);
			} finally {
				setIsLoading(false);
			}
		},
		[offset],
	);

	const refreshGallery = useCallback(() => {
		setOffset(0);
		loadImages(true);
	}, [loadImages]);

	const loadMore = useCallback(() => {
		if (!isLoading && hasMore) {
			loadImages(false);
		}
	}, [isLoading, hasMore, loadImages]);

	// Carregar imagens ao inicializar
	useEffect(() => {
		setOffset(0);
		loadImages(true);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	return {
		images,
		isLoading,
		error,
		total,
		hasMore,
		refreshGallery,
		loadMore,
	};
};
