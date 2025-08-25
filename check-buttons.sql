SELECT 
    ic.id,
    ic.type,
    ic."actionReplyButton",
    ic."actionList"
FROM "InteractiveContent" ic 
JOIN "Template" t ON t.id = ic."templateId" 
WHERE t.id = 'cmeq6v0oy0001pf0k5i27i9vs';
