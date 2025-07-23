// types/@react-input/mask.d.ts

declare module '@react-input/mask' {
    import type * as React from 'react';

    interface MaskedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
      mask: string;
      maskChar?: string | null;
      beforeMaskedValueChange?: (
        newState: any,
        oldState: any,
        userInput: string,
        maskOptions: any
      ) => any;
      alwaysShowMask?: boolean;
      // Adicione outras props conforme necessário
    }

    const MaskedInput: React.FC<MaskedInputProps>;

    export default MaskedInput;
  }
