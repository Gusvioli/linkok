# LinkOK: guia de publicação na Chrome Web Store

## 1. O que está pronto

| Arquivo | Uso |
|---|---|
| `linkok-1.0.0.zip` | Pacote da extensão (o `manifest.json` fica na raiz do zip) |
| `privacy.html` | Política de privacidade, para hospedar numa URL pública |
| `icone_loja_128x128.png` | Ícone da loja |
| `screenshot_1_1280x800.png`, `screenshot_2_1280x800.png` | Capturas de tela (a loja exige de 1 a 5) |
| `promo_pequeno_440x280.png` | Tile promocional pequeno |
| `promo_marquee_1400x560.png` | Tile marquee (opcional) |

Os dois screenshots foram gerados com a extensão real rodando no Chromium, em uma página de teste com endereços fictícios (`.example`).

## 2. Antes de enviar

1. **Preencha o e-mail** em `privacy.html` (procure por `[SEU-EMAIL]`, aparece duas vezes).
2. **Hospede a política** no seu GitHub Pages: no repositório `Gusvioli.github.io`, crie a pasta `linkok/`, coloque o `privacy.html` dentro e faça o push. A URL fica `https://gusvioli.github.io/linkok/privacy.html`. Abra no navegador para confirmar que carrega. A loja não aceita a página inicial de um repositório como política de privacidade.
3. **Teste a extensão** em `chrome://extensions` (Modo do desenvolvedor, "Carregar sem compactação"). Teste também com uma chave real do Safe Browsing, que é a única parte que eu não consegui validar.

## 3. Conta de desenvolvedor

Acesse o Painel do Desenvolvedor da Chrome Web Store (`chrome.google.com/webstore/devconsole`) com a conta Google que será a dona da extensão. O primeiro acesso pede aceitar os termos, ativar a verificação em duas etapas e pagar uma taxa única de registro (costuma ser US$ 5; confirme o valor no painel).

## 4. Enviar o pacote

No painel: **Novo item** e envie o `linkok-1.0.0.zip`. Depois preencha as abas abaixo.

## 5. Aba "Detalhes da página" (Store listing)

**Nome:** LinkOK – Verificador de Links

**Resumo (vem do manifest):** Verifica automaticamente os links de cada página e destaca os suspeitos ou perigosos.

**Descrição detalhada:**

```
O LinkOK verifica automaticamente os links de cada página que você abre e destaca os que parecem suspeitos ou perigosos, antes de você clicar.

Como funciona
• Links perigosos ficam com borda vermelha e links suspeitos com borda tracejada âmbar.
• Passe o mouse sobre um link marcado para ver o motivo do alerta.
• O ícone da extensão mostra quantos links foram sinalizados, e o popup lista cada um com os motivos.
• Antes de abrir um link perigoso, a extensão pede confirmação (você pode desligar isso nas configurações).
• Funciona também em páginas que carregam links depois, como redes sociais e webmails.

O que ele analisa
A análise local, sempre ativa e feita dentro do navegador, procura sinais comuns de golpes: endereço com IP no lugar de domínio, caracteres internacionais usados para imitar sites conhecidos, "usuario@" disfarçando o destino, texto do link diferente do destino real, nome de marca em domínio que não é o oficial, encurtadores de link, extensões de domínio muito usadas em golpes, portas incomuns, conexões sem criptografia e downloads de executáveis.

Google Safe Browsing (opcional)
Se você informar uma chave de API do Google Safe Browsing nas configurações, os links também são conferidos nas listas de phishing, malware e software indesejado do Google. Sem a chave, nada sai do seu navegador.

Privacidade
Sem contas, sem anúncios e sem rastreamento. As suas configurações ficam salvas apenas no seu navegador.

Importante
"Nenhum alerta encontrado" reduz o risco, mas não garante que um link seja seguro. Continue atento ao clicar.
```

**Categoria:** Ferramentas (ou a categoria de segurança, se aparecer no painel).
**Idioma:** Português (Brasil).
**Ícone, screenshots e tiles:** envie os arquivos da tabela acima.
**Site oficial / suporte (opcional):** `https://gusvioli.github.io/` ou o repositório da extensão.

## 6. Aba "Práticas de privacidade" (Privacy)

**Finalidade única:**
```
Verificar automaticamente os links de uma página web e sinalizar os que parecem suspeitos ou perigosos.
```

**Justificativa das permissões:**

| Permissão | Justificativa |
|---|---|
| `storage` | Salvar localmente as preferências do usuário e a chave de API opcional do Google Safe Browsing. |
| Host `https://safebrowsing.googleapis.com/*` | Consultar a API Google Safe Browsing quando o usuário informa a própria chave, para checar se os links da página constam em listas de phishing e malware. |
| Acesso a `http://*/*` e `https://*/*` (content script) | Necessário para ler os links (`<a href>`) de qualquer página que o usuário abra, analisá-los e destacar os suspeitos. Nenhum outro conteúdo da página é lido, e a análise é local. |

**Código remoto:** selecione **Não**. Todo o código está dentro do pacote, e a extensão só envia requisições à API do Google Safe Browsing, sem baixar nem executar código.

**Uso de dados (o que declarar):**
- Marque **Conteúdo do site** (endereços de links, enviados ao Google só quando o usuário informa uma chave).
- Por precaução, marque também **Informações de autenticação**, porque a chave de API do usuário é enviada ao Google como credencial da consulta.
- Não marque as demais categorias.
- Marque as três certificações: não vende dados a terceiros, não usa os dados para finalidades alheias ao propósito único e não usa os dados para avaliação de crédito ou empréstimos.

**URL da política de privacidade:** `https://gusvioli.github.io/linkok/privacy.html`

## 7. Aba "Distribuição"

- **Visibilidade:** pública, ou "não listada" se quiser testar com um grupo antes.
- **Regiões:** todas, a menos que queira restringir.
- **Monetização:** gratuita.

## 8. Instruções para o revisor (campo "Instruções de teste")

```
Não é preciso criar conta nem fazer login. Para testar: abra qualquer página que contenha links (por exemplo, uma página com links para endereços como http://192.168.0.10:8080/login ou http://paypal-seguro.example:8080/entrar) e a extensão destacará os links suspeitos (borda vermelha ou tracejada âmbar) e mostrará o total no ícone. O popup lista os links sinalizados e o motivo de cada um. A chave de API do Google Safe Browsing é opcional: sem ela, a análise é totalmente local.
```

## 9. Enviar para revisão

Clique em **Enviar para revisão**. O prazo varia. Extensões que pedem acesso a todas as páginas costumam passar por uma revisão mais cuidadosa, então a justificativa da permissão e a política de privacidade precisam estar completas. Se houver rejeição, o painel e o e-mail indicam o motivo, e você corrige e reenvia.

## 10. Depois de publicada

- Para atualizar: aumente `version` no `manifest.json` (por exemplo, `1.0.1`), gere um novo zip e envie em **Pacote** no painel.
- Se um dia mudar o que a extensão coleta ou envia, atualize a política de privacidade e a aba de privacidade antes de publicar a nova versão.

## 11. Pontos de atenção

- **Termos da API Safe Browsing:** a API v4 do Google é voltada a uso não comercial. Se um dia monetizar a extensão, avalie a Web Risk API (versão comercial). Leia os termos antes de publicar.
- **Aviso dentro do produto:** guias recentes indicam que, desde 1º de agosto de 2026, a loja exige que a coleta de dados seja limitada ao estritamente necessário e informada de forma visível no próprio produto, e não só na página da loja. Por isso o popup explica, ao lado do campo da chave, que os endereços dos links passam a ser enviados ao Google. Confirme o texto da política vigente no painel.
- **Falsos positivos e negativos:** a análise local é heurística. O texto da loja já avisa que "nenhum alerta" não é garantia de segurança, e é bom manter isso.
