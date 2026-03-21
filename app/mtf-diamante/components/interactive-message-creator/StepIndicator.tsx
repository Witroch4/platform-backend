import React from "react";

interface StepIndicatorProps {
	currentStep: "type-selection" | "configuration" | "preview";
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
	const steps = [
		{ key: "type-selection", label: "Configure Model", number: 1 },
		{ key: "configuration", label: "Edit Model", number: 2 },
		{ key: "preview", label: "Review & Save", number: 3 },
	];

	const getCurrentStepIndex = () => {
		return steps.findIndex((step) => step.key === currentStep);
	};

	const currentStepIndex = getCurrentStepIndex();

	return (
		<div className="mb-8">
			<div className="flex items-center justify-between mb-2">
				{steps.map((step, index) => (
					<React.Fragment key={step.key}>
						<div
							className={`flex items-center rounded-full border-2 ${
								index <= currentStepIndex ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-300 text-gray-400"
							} w-10 h-10 justify-center font-bold`}
						>
							{step.number}
						</div>
						{index < steps.length - 1 && (
							<div className={`flex-1 h-1 mx-2 ${index < currentStepIndex ? "bg-blue-500" : "bg-gray-300"}`}></div>
						)}
					</React.Fragment>
				))}
			</div>
			<div className="flex items-center justify-between text-sm px-1">
				{steps.map((step, index) => (
					<div
						key={step.key}
						className={`${
							index <= currentStepIndex ? "text-blue-500 font-medium" : "text-gray-500"
						} text-center flex-1`}
					>
						{step.label}
					</div>
				))}
			</div>
		</div>
	);
};
