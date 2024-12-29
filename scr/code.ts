// Types
type ParentType = (BaseNode & ChildrenMixin) | null;
type PropertyValueType = number | string | string[];

// Utility functions
function sliceNum(num: number): string {
  return num.toFixed(2).replace(/\.00$/, "");
}

function nearestOpacity(nodeOpacity: number): number {
  return Math.round(nodeOpacity * 100);
}

function rgbaFromRGB(color: RGB, opacity: number = 1): string {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${opacity})`;
}

function indentString(str: string, indentLevel: number = 2): string {
  return str.replace(/^(?!\s*$)/gm, " ".repeat(indentLevel));
}

// Helper functions for styles
function getBorderWidth(node: SceneNode): string {
  if ("strokeWeight" in node && node.strokeWeight !== figma.mixed) {
    return `${sliceNum(node.strokeWeight)}px`;
  }
  return "0px";
}

function getBorderColor(node: SceneNode): string {
  if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0 && node.strokes[0].type === "SOLID") {
    return rgbaFromRGB(node.strokes[0].color, node.strokes[0].opacity || 1);
  }
  return "transparent";
}

function getBorderRadius(node: SceneNode): string {
  if ("cornerRadius" in node && node.cornerRadius !== figma.mixed && typeof node.cornerRadius === 'number') {
    return `${sliceNum(node.cornerRadius)}px`;
  }
  return "0px";
}

function getShadow(node: BlendMixin): string[] {
  if (Array.isArray(node.effects)) {
    return node.effects.filter(effect => effect.type === "DROP_SHADOW" && effect.visible).map(effect => 
      `${sliceNum((effect as DropShadowEffect).offset.x)}px ${sliceNum((effect as DropShadowEffect).offset.y)}px ${sliceNum(effect.radius)}px ${rgbaFromRGB(effect.color, effect.opacity)}`
    );
  }
  return [];
}

function getPadding(node: FrameNode | InstanceNode | ComponentNode | ComponentSetNode): string {
  if ("paddingLeft" in node) {
    return `${sliceNum(node.paddingTop || 0)}px ${sliceNum(node.paddingRight || 0)}px ${sliceNum(node.paddingBottom || 0)}px ${sliceNum(node.paddingLeft || 0)}px`;
  }
  return "0px";
}

function getBackgroundColor(node: SceneNode): string {
  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0 && node.fills[0].type === "SOLID") {
    return rgbaFromRGB(node.fills[0].color, node.fills[0].opacity || 1);
  }
  return "transparent";
}

// Main functions

function convertIntoNodes(sceneNode: ReadonlyArray<SceneNode>, parent: ParentType = null): Array<SceneNode> {
  return sceneNode.map(node => {
    switch (node.type) {
      case "RECTANGLE":
      case "ELLIPSE":
      case "LINE":
      case "TEXT":
      case "VECTOR":
      case "GROUP":
      case "FRAME":
      case "INSTANCE":
      case "COMPONENT":
      case "COMPONENT_SET":
      case "SECTION":
        return node;
      default:
        return null;
    }
  }).filter(notEmpty);
}

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

// Modified WidgetGenerator for prompt creation
function WidgetGenerator(sceneNode: ReadonlyArray<SceneNode>): string {
  return sceneNode.filter(node => node.visible).map(node => {
    switch (node.type) {
      case "RECTANGLE":
      case "ELLIPSE": return generateContainerPrompt(node);
      case "GROUP": return generateGroupPrompt(node);
      case "FRAME":
      case "COMPONENT":
      case "INSTANCE":
      case "COMPONENT_SET": return generateFramePrompt(node as FrameNode);
      case "TEXT": return generateTextPrompt(node);
      case "LINE": return generateLinePrompt(node);
      case "VECTOR": return generateVectorPrompt(node);
      case "SECTION": return generateSectionPrompt(node);
      default: return `Unknown node type: ${node.type}`;
    }
  }).join("\n");
}

// Helper functions to generate detailed prompts
function generateContainerPrompt(node: SceneNode & GeometryMixin & BlendMixin): string {
  const componentName = "name" in node && node.name ? ` (Component Name: ${node.name})` : "";
  return `- A ${node.type.toLowerCase()}${componentName} with dimensions ${sliceNum(node.width)}x${sliceNum(node.height)}px, positioned at (${sliceNum(node.x)},${sliceNum(node.y)})px, with background color ${getBackgroundColor(node)}, border width ${getBorderWidth(node)} color ${getBorderColor(node)}, opacity at ${nearestOpacity(node.opacity || 1)}%, border radius ${getBorderRadius(node)}, and shadow ${getShadow(node).join(', ')}.`;
}

function generateGroupPrompt(node: GroupNode): string {
  const componentName = "name" in node && node.name ? ` (Component Name: ${node.name})` : "";
  const childrenPrompts = node.children.map(child => WidgetGenerator([child])).join("\n");
  return `- A group${componentName} with ${node.children.length} children, dimensions ${sliceNum(node.width)}x${sliceNum(node.height)}px, positioned at (${sliceNum(node.x)},${sliceNum(node.y)})px, with properties:\n${indentString(childrenPrompts)}`;
}

function generateFramePrompt(node: FrameNode): string {
  const componentName = "name" in node && node.name ? ` (Component Name: ${node.name})` : "";
  const layoutInfo = node.layoutMode !== 'NONE' ? `Layout mode: ${String(node.layoutMode)}, Alignment: ${String(node.primaryAxisAlignItems)}/${String(node.counterAxisAlignItems)}, Padding: ${getPadding(node)}` : "Layout mode: NONE";
  const childrenPrompts = node.children.map(child => WidgetGenerator([child])).join("\n");
  return `- A ${node.type.toLowerCase()} frame${componentName} with ${node.children.length} children, dimensions ${sliceNum(node.width)}x${sliceNum(node.height)}px, positioned at (${sliceNum(node.x)},${sliceNum(node.y)})px, ${layoutInfo}:\n${indentString(childrenPrompts)}`;
}

function generateTextPrompt(node: TextNode): string {
  const componentName = "name" in node && node.name ? ` (Component Name: ${node.name})` : "";
  const textContent = node.characters.replace(/\n/g, '\\n');
  let fontName: { family: string; style: string } = { family: "Unknown", style: "Unknown" };

  if (node.fontName !== figma.mixed && typeof node.fontName === 'object') {
    fontName = {
      family: (node.fontName as FontName).family,
      style: (node.fontName as FontName).style
    };
  }

  // Handle mixed values and complex types
  const fontSize = node.fontSize !== figma.mixed ? node.fontSize : 0;
  let lineHeight = "auto";
  if (node.lineHeight !== figma.mixed && typeof node.lineHeight === 'object') {
    lineHeight = node.lineHeight.unit === "AUTO" ? "auto" : `${node.lineHeight.value}${node.lineHeight.unit}`;
  } else if (typeof node.lineHeight === 'number') {
    lineHeight = sliceNum(node.lineHeight);
  }

  let letterSpacing = "normal";
  if (node.letterSpacing !== figma.mixed && typeof node.letterSpacing === 'object') {
    letterSpacing = `${node.letterSpacing.value}${node.letterSpacing.unit}`;
  } else if (typeof node.letterSpacing === 'number') {
    letterSpacing = sliceNum(node.letterSpacing);
  }

  return `- Text node${componentName} with content: "${textContent}", font size ${sliceNum(typeof fontSize === 'number' ? fontSize : 0)}px, font family ${fontName.family}, font style ${fontName.style}, alignment ${node.textAlignHorizontal || "LEFT"}, color ${getBackgroundColor(node)}, opacity at ${nearestOpacity(node.opacity || 1)}%, line height ${lineHeight}, and letter spacing ${letterSpacing}.`;
}

function generateLinePrompt(node: LineNode): string {
  const componentName = "name" in node && node.name ? ` (Component Name: ${node.name})` : "";
  const strokeWeight = node.strokeWeight !== figma.mixed ? node.strokeWeight : 0;
  const opacity = node.opacity !== undefined ? node.opacity : 1;

  return `- A line${componentName} from (${sliceNum(node.x)},${sliceNum(node.y)})px to (${sliceNum(node.x + node.width)},${sliceNum(node.y + node.height)})px, with stroke width ${sliceNum(typeof strokeWeight === 'number' ? strokeWeight : 0)}px, color ${getBorderColor(node)}, and opacity at ${nearestOpacity(opacity)}%.`;
}

function generateVectorPrompt(node: VectorNode): string {
  const componentName = "name" in node && node.name ? ` (Component Name: ${node.name})` : "";
  return `- A vector node${componentName} with dimensions ${sliceNum(node.width)}x${sliceNum(node.height)}px, positioned at (${sliceNum(node.x)},${sliceNum(node.y)})px.`;
}

function generateSectionPrompt(node: SectionNode): string {
  const componentName = "name" in node && node.name ? ` (Component Name: ${node.name})` : "";
  const childrenPrompts = node.children.map(child => WidgetGenerator([child])).join("\n");
  return `- A section node${componentName} with ${node.children.length} children, dimensions ${sliceNum(node.width)}x${sliceNum(node.height)}px, positioned at (${sliceNum(node.x)},${sliceNum(node.y)})px:\n${indentString(childrenPrompts)}`;
}

// Main function
function Main(sceneNode: Array<SceneNode>): string {
  return WidgetGenerator(sceneNode);
}

// Entry point for generating prompts
figma.showUI(__html__, { width: 630, height: 690 });

figma.ui.onmessage = (msg: { type: string, framework: string, database: string,description: string }) => {
  if (msg.type === 'generate') {
    const currentpage = figma.currentPage.selection;
    let output = "";

    if (!currentpage || currentpage.length === 0) {
      figma.ui.postMessage({ type: 'prompt', prompt: "No nodes selected." });
    } else {
      const convertedSelection = convertIntoNodes(currentpage, null);
      
      const pageName = figma.currentPage.name; // Assuming page name could be used for component naming

      output += `Create a reusable and performant ${msg.framework} Component with the following specifications, add it to the existing project or create a new ${msg.framework} project:\n\n`;
      output += `### Overview:\n`;
      output += `- **Description**: ${msg.description}\n`;
      output += `- **Type**: A ${msg.framework} that includes all underlying components and instances.\n`;
      output += `- **Framework**: ${msg.framework} (use appropriate syntax for type safety) Typescript if the framework supports it\n`;
      output += `- **Accessibility**: Ensure all components are accessible by using appropriate ARIA attributes.\n`;
      output += `- **Performance**: Optimize the code for performance, following the selected framework's best practices.\n`;
      output += `- **Reusability**: All components and styles must be reusable.\n`;
      output += `- **Global CSS**: All CSS must be stored in a single global CSS file or theme file.\n`;
      debugger;
      if (msg.database && msg.database !== 'null') 
      {
      output += `- **Database**: Privide the  ${msg.database} schema to create the database table. for any input fields.\n\n`;
      }
      output += `### Layout:\n`;
      let prompt = Main(convertedSelection);
      output += `- This layout is created based on the selected nodes from Figma.\n`;
      output += prompt; // Append the detailed component description previously generated by Main
      
      output += `### Implementation:\n`;
      output += `- Create all underlying components with their different variations.\n`;
      output += `- Use ${msg.framework} hooks like \`useState\` for managing internal state if necessary, particularly for managing hover effects if not using CSS hover.\n`;
      output += `- Ensure the component uses flexbox for aligning icon and text horizontally (if applicable).\n`;
      output += `- Use \`role\` attributes where necessary to define the semantic role of the elements.\n`;
      output += `- Use \`aria-label\` to provide descriptive labels for interactive elements.\n`;
      output += `- Use \`aria-expanded\` for elements that expand or collapse content.\n`;
      output += `- Follow the selected framework's coding best practices and standards.\n`;
      output += `- All styles must be defined in a global CSS file or theme file and applied using CSS classes.\n`;
      output += `- Swap the text icon with a randomly selected icon.\n`;
      output += `- Add validation for the input fields.\n\n`;

      output += `### Usage:\n`;
      output += `- Include the component in your application.\n`;
      output += `- Use the component as needed in your application.\n`;
      output += `- Ensure the component is responsive and works on all screen sizes.\n`;
      output += `- Test the component on different browsers and devices to ensure compatibility.\n`;
      output += `- Ensure the component is accessible and meets all WCAG standards.\n`;
      output += `- Ensure the component is performant and does not impact the application's performance.\n`;
      output += `- Ensure the component is reusable and can be used in different parts of the application.\n\n`;
      

      figma.ui.postMessage({ type: 'prompt', prompt: output });      
    }
  }
};
