export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Requires one of: ${roles.join(', ')}.`
      });
    }

    next();
  };
}

export function requireSameTeam(paramName = 'teamId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    // Super admin and Usthad can access any team
    if (['super_admin', 'usthad'].includes(req.user.role)) {
      return next();
    }

    const requestedTeamId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;

    if (!userTeamId || !requestedTeamId || userTeamId !== requestedTeamId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You may only access data for your assigned team.'
      });
    }

    next();
  };
}

export function requireSelfOrLeader(paramName = 'memberId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    // Super admin and Usthad have global access
    if (['super_admin', 'usthad'].includes(req.user.role)) {
      return next();
    }

    const requestedMemberId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    const currentUserId = req.user._id.toString();

    // If accessing own record
    if (requestedMemberId && requestedMemberId.toString() === currentUserId) {
      return next();
    }

    // If Team Leader, allow if in same team (caller will verify target user's team or query filter handles it)
    if (req.user.role === 'team_leader') {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Access denied: You may only access your own records.'
    });
  };
}
