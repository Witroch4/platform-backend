import RegisterForm from "@/components/auth/register-form";
import { redirect } from "next/navigation";

const Register = async () => {
	// Redireciona para login se o registro estiver desativado
	if (process.env.DISABLE_REGISTRATION === "true") {
		redirect("/auth/login");
	}

	return (
		<div className="flex flex-col w-full min-h-full items-center justify-center">
			<RegisterForm />
		</div>
	);
};

export default Register;
