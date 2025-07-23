# Template Library System

The Template Library System provides a centralized way to manage and share WhatsApp templates and interactive messages across the MTF Diamante platform.

## Features

### 1. Template Management
- **Global Templates**: Created by administrators, available to all users
- **Account-Specific Templates**: Created by users for their own use
- **Template Types**: Support for both WhatsApp templates and interactive messages
- **Variable System**: Dynamic variable replacement with custom names

### 2. Approval Workflow
- **Templates**: Require approval before use (configurable)
- **Interactive Messages**: Available immediately without approval
- **Request Management**: Users can request approval for global templates
- **Admin Processing**: Administrators can approve/reject requests with messages

### 3. Library Features
- **Search & Filter**: Find templates by name, description, type, or scope
- **Categories & Tags**: Organize templates with categories and tags
- **Usage Tracking**: Monitor how often templates are used
- **Preview System**: Real-time WhatsApp-style preview with variable substitution

## Usage

### For Administrators

#### Creating Global Templates
1. Navigate to MTF Diamante → Template Library
2. Click "Create Template"
3. Fill in template details:
   - **Name**: Descriptive name for the template
   - **Type**: Choose "Template" or "Interactive Message"
   - **Scope**: Select "Global" for all users
   - **Content**: Add header, body, footer with variables like `{{name}}`
   - **Variables**: System automatically detects variables from content
   - **Tags**: Add tags for better organization

#### Managing Approval Requests
1. Go to "Approval Requests" tab
2. Review pending requests from users
3. Click "View" to see request details
4. Approve or reject with optional response message

### For Regular Users

#### Using Templates from Library
1. In template creation forms, look for "Browse Library" button
2. Search and filter available templates
3. Select a template and customize variables
4. For global templates requiring approval:
   - Click "Request Approval"
   - Wait for administrator approval
   - Use template once approved

#### Creating Account-Specific Templates
1. Create templates with scope "Account Specific"
2. These are immediately available for your use
3. Not visible to other users

## API Endpoints

### Template Library Management
- `GET /api/admin/mtf-diamante/template-library` - List templates
- `POST /api/admin/mtf-diamante/template-library` - Create template
- `GET /api/admin/mtf-diamante/template-library/[id]` - Get template details
- `PUT /api/admin/mtf-diamante/template-library/[id]` - Update template
- `DELETE /api/admin/mtf-diamante/template-library/[id]` - Delete template

### Approval Management
- `GET /api/admin/mtf-diamante/template-library/approval` - List approval requests
- `POST /api/admin/mtf-diamante/template-library/approval` - Request approval
- `PUT /api/admin/mtf-diamante/template-library/approval/[id]` - Process request

### Interactive Messages
- `POST /api/admin/mtf-diamante/template-library/use-interactive` - Use interactive message

## Database Schema

### TemplateLibrary
- Stores template content, metadata, and configuration
- Supports both templates and interactive messages
- Tracks usage statistics and approval requirements

### TemplateApprovalRequest
- Manages approval workflow for templates
- Tracks request status and processing history
- Stores custom variables for specific requests

## Integration

The Template Library integrates with:
- **Template Creation Forms**: Browse and select from library
- **Interactive Message System**: Immediate use without approval
- **Variable Management**: Consistent variable handling across system
- **WhatsApp API**: Seamless template deployment

## Best Practices

### For Administrators
1. Create comprehensive global templates for common use cases
2. Use clear, descriptive names and categories
3. Include helpful descriptions and examples
4. Review approval requests promptly
5. Provide clear feedback when rejecting requests

### For Users
1. Search existing templates before creating new ones
2. Use meaningful variable names in custom templates
3. Test templates with preview before requesting approval
4. Provide context when requesting approval for global templates
5. Keep account-specific templates organized with tags

## Security & Permissions

- **Global Template Creation**: Admin/SuperAdmin only
- **Account Template Creation**: All authenticated users
- **Approval Processing**: Admin/SuperAdmin only
- **Template Usage**: Based on approval status and scope
- **Template Modification**: Creator or Admin only

## Troubleshooting

### Common Issues
1. **Template not appearing**: Check scope and approval status
2. **Variables not working**: Ensure proper `{{variable}}` format
3. **Approval stuck**: Contact administrator
4. **Permission denied**: Check user role and template ownership

### Error Messages
- "Template not found": Template may have been deleted
- "Approval required": Request approval from administrator
- "Permission denied": Insufficient privileges for action
- "Invalid variable format": Use `{{variable_name}}` format